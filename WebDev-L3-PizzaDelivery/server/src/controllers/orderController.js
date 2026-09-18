import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ALLOWED_TRANSITIONS, SOCKET_EVENTS } from '../config/constants.js';
import { emitToAdmin, emitToUser } from '../config/socket.js';
import inventoryService from '../services/inventoryService.js';
import razorpayService from '../services/razorpayService.js';

// Turns the client cart into a priced, stock-checked, unpaid order and opens a
// matching Razorpay order. Prices are recomputed here; anything the client sent
// about money is ignored.
export const createOrder = asyncHandler(async (req, res) => {
  const { items: cart, deliveryAddress } = req.body;

  const { items } = await inventoryService.resolveCart(cart);
  const totals = inventoryService.computeTotals(items);

  const order = await Order.create({
    user: req.user._id,
    items,
    ...totals,
    deliveryAddress,
    paymentStatus: 'Pending',
    orderStatus: 'Pending Payment',
    statusHistory: [{ status: 'Pending Payment', note: 'Order created, awaiting payment' }],
  });

  let razorpayOrder;
  try {
    razorpayOrder = await razorpayService.createOrder({
      amount: totals.totalAmount,
      currency: totals.currency,
      receipt: String(order._id),
    });
  } catch (err) {
    // The order only exists to carry the gateway id. If the gateway refused we
    // remove it, so failed checkouts never leave unusable orders behind.
    await Order.deleteOne({ _id: order._id });
    throw err;
  }

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return res.status(201).json({
    success: true,
    message: 'Order created. Complete payment to confirm.',
    order: order.toClientJSON(),
    payment: {
      keyId: razorpayService.getPublicKey(),
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount, // paise
      currency: razorpayOrder.currency,
    },
  });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  return res.json({ success: true, orders: orders.map((o) => o.toClientJSON()) });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) throw ApiError.notFound('Order not found');

  const isOwner = String(order.user?._id || order.user) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('You cannot view this order');
  }

  return res.json({
    success: true,
    order: { ...order.toClientJSON(), customer: order.user?.name },
  });
});

// ---- Admin order management ----

export const listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const { status, paymentStatus, search } = req.query;

  const filter = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  let userIds = null;
  if (search) {
    const User = (await import('../models/User.js')).default;
    const matched = await User.find({ email: { $regex: search, $options: 'i' } }).select('_id');
    userIds = matched.map((u) => u._id);
    filter.$or = [{ user: { $in: userIds } }];
    if (/^[0-9a-fA-F]{24}$/.test(search)) filter.$or.push({ _id: search });
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    orders: orders.map((o) => ({ ...o.toClientJSON(), customer: o.user })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

// Validates the requested status against the transition map before writing, so
// an invalid move can never be persisted even if the UI is bypassed.
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  const allowed = ALLOWED_TRANSITIONS[order.orderStatus] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move an order from "${order.orderStatus}" to "${status}".`,
      { allowed },
    );
  }

  order.orderStatus = status;
  order.statusHistory.push({ status, at: new Date(), note: note || '' });
  await order.save();

  const payload = { orderId: order._id, orderStatus: status, statusHistory: order.statusHistory };
  emitToUser(order.user, SOCKET_EVENTS.ORDER_STATUS_UPDATED, payload);
  emitToAdmin(SOCKET_EVENTS.ORDER_STATUS_UPDATED, payload);

  return res.json({ success: true, message: `Order marked as ${status}`, order: order.toClientJSON() });
});