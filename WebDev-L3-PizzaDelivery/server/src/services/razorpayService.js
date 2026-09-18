import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

let client = null;

const getClient = () => {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) return null;
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
};

// Creates a Razorpay order. Amount is expected in the smallest currency unit
// (paise for INR), which is why we multiply the rupee total by 100.
export const createOrder = async ({ amount, currency = 'INR', receipt }) => {
  const rzp = getClient();
  if (!rzp) {
    throw new ApiError(
      503,
      'Payment gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }

  try {
    return await rzp.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      payment_capture: 1,
    });
  } catch (err) {
    // The SDK surfaces gateway failures as plain objects (often without a
    // `message`), which would otherwise reach the client as a bare 500.
    const description =
      err?.error?.description || err?.message || 'Payment gateway rejected the request';
    // 502 (not 500) makes it explicit that an upstream dependency refused us.
    throw new ApiError(502, `Could not start payment: ${description}. Check your Razorpay test credentials.`, {
      gateway: err?.error?.code || 'unknown',
    });
  }
};

// Verifies the checkout callback signature in constant time. The signed payload
// is `${razorpay_order_id}|${razorpay_payment_id}` keyed by the account secret.
export const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, signature }) => {
  if (!env.razorpay.keySecret) {
    throw new ApiError(503, 'Payment gateway is not configured');
  }
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Webhook bodies are signed over the raw bytes with the webhook secret.
export const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const isConfigured = () => Boolean(env.razorpay.keyId && env.razorpay.keySecret);

export const getPublicKey = () => env.razorpay.keyId;

export default {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  isConfigured,
  getPublicKey,
};