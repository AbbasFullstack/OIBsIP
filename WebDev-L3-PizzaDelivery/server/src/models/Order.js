import mongoose from 'mongoose';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../config/constants.js';

// One entry per item. A `menu` item points at a Pizza, a `custom` item is an
// ad-hoc ingredient combination. Both store the resolved ingredient refs so the
// order stays readable even if the catalog later changes.
const orderItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['menu', 'custom'], required: true },
    pizza: { type: mongoose.Schema.Types.ObjectId, ref: 'Pizza' },
    name: { type: String, required: true },
    ingredientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient' }],
    // How many stock units of each ingredient this item consumes, keyed by id.
    stockUsage: [
      {
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const deliveryAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    itemsTotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    deliveryAddress: { type: deliveryAddressSchema, required: true },

    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'Pending', index: true },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },

    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'Pending Payment',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true },
);

// Sparse+unique makes order creation idempotent per Razorpay order id without
// colliding on the many documents that have no id yet.
orderSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

orderSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id,
    items: this.items,
    itemsTotal: this.itemsTotal,
    taxAmount: this.taxAmount,
    deliveryFee: this.deliveryFee,
    totalAmount: this.totalAmount,
    currency: this.currency,
    deliveryAddress: this.deliveryAddress,
    paymentStatus: this.paymentStatus,
    orderStatus: this.orderStatus,
    statusHistory: this.statusHistory,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Order = mongoose.model('Order', orderSchema);

export default Order;