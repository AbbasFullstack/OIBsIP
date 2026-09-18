import mongoose from 'mongoose';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { emitToAdmin, emitToUser } from '../config/socket.js';
import { supportsTransactions } from '../config/db.js';
import razorpayService from '../services/razorpayService.js';
import inventoryService from '../services/inventoryService.js';
import emailService from '../services/emailService.js';
import logger from '../utils/logger.js';

// Applies the paid-state change and the stock decrement. Runs inside a session
// when the deployment is a replica set, and directly otherwise.
const applyPayment = async (order, { razorpayPaymentId, signature, session }) => {
  await inventoryService.decrementStockForOrder(order, session);

  order.paymentStatus = 'Paid';
  order.razorpayPaymentId = razorpayPaymentId || order.razorpayPaymentId;
  order.razorpaySignature = signature || order.razorpaySignature;
  order.orderStatus = 'Received';
  order.statusHistory.push({ status: 'Received', at: new Date(), note: 'Payment verified' });

  return order.save(session ? { session } : {});
};

// Shared by the checkout callback and the webhook fallback. It is idempotent:
// once an order is marked Paid a replay returns success without touching stock.
const confirmPayment = async ({ razorpayOrderId, razorpayPaymentId, signature }) => {
  const order = await Order.findOne({ razorpayOrderId });
  if (!order) throw ApiError.notFound('No order matches that payment');

  if (order.paymentStatus === 'Paid') {
    return { order, alreadyProcessed: true };
  }

  let updated;

  if (supportsTransactions) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        updated = await applyPayment(order, { razorpayPaymentId, signature, session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    updated = await applyPayment(order, { razorpayPaymentId, signature });
  }

  // Atomic stock changes just happened; refresh admin inventory views.
  emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'decrement' });
  emitToUser(order.user, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
    orderId: order._id,
    orderStatus: 'Received',
    statusHistory: order.statusHistory,
  });
  emitToAdmin(SOCKET_EVENTS.ORDER_CREATED, { order: updated.toClientJSON() });

  try {
    const user = await mongoose.model('User').findById(order.user);
    if (user) {
      await emailService.sendOrderConfirmation({
        to: user.email,
        name: user.name,
        orderId: order._id,
        totalAmount: order.totalAmount,
        items: order.items,
      });
    }
  } catch (err) {
    logger.error(`Order confirmation email failed: ${err.message}`);
  }

  return { order: updated, alreadyProcessed: false };
};

// Client callback after Razorpay Checkout closes successfully.
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const valid = razorpayService.verifyPaymentSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    // Record the failure so the order is not left silently pending forever.
    await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { paymentStatus: 'Failed', razorpayPaymentId: razorpay_payment_id || '' },
    );
    throw ApiError.badRequest('Payment signature verification failed');
  }

  const { order, alreadyProcessed } = await confirmPayment({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  return res.json({
    success: true,
    message: alreadyProcessed ? 'Payment already confirmed' : 'Payment verified successfully',
    order: order.toClientJSON(),
  });
});

// Backup path: if the browser never reached /verify, Razorpay still calls us.
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody?.toString('utf8') || JSON.stringify(req.body);

  if (!razorpayService.verifyWebhookSignature({ rawBody, signature })) {
    throw ApiError.badRequest('Invalid webhook signature');
  }

  const event = req.body?.event;
  const paymentEntity = req.body?.payload?.payment?.entity;
  const orderEntity = req.body?.payload?.order?.entity;

  if (event === 'payment.captured' || event === 'order.paid') {
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    if (razorpayOrderId) {
      try {
        await confirmPayment({
          razorpayOrderId,
          razorpayPaymentId: paymentEntity?.id,
          signature: '',
        });
      } catch (err) {
        logger.error(`Webhook payment confirmation failed: ${err.message}`);
      }
    }
  }

  // Always ack so Razorpay does not retry forever.
  return res.json({ success: true });
});