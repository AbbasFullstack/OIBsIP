// Shared enums and business rules used by models, controllers, and the client
// contract. Keeping them here means a status string is spelled exactly once.

export const ROLES = ['user', 'admin'];

export const INGREDIENT_CATEGORIES = ['base', 'sauce', 'cheese', 'veggie'];

export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'];

export const ORDER_STATUSES = [
  'Pending Payment',
  'Received',
  'In Kitchen',
  'Sent to Delivery',
  'Delivered',
  'Cancelled',
];

// The happy-path progression shown on the tracking page.
export const ORDER_FLOW = ['Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'];

// Allowed status moves for an admin. Cancellation is possible any time before
// delivery; once delivered an order is terminal.
export const ALLOWED_TRANSITIONS = {
  'Pending Payment': ['Cancelled'],
  Received: ['In Kitchen', 'Cancelled'],
  'In Kitchen': ['Sent to Delivery', 'Cancelled'],
  'Sent to Delivery': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

// Pricing rules applied server-side, never trusted from the client.
export const PRICING = {
  taxRate: 0.05, // 5% GST
  deliveryFee: 40, // flat fee in INR
  freeDeliveryThreshold: 500, // subtotal at/above this ships free
  currency: 'INR',
};

export const SOCKET_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_STATUS_UPDATED: 'order:statusUpdated',
  INVENTORY_UPDATED: 'inventory:updated',
  INVENTORY_LOW_STOCK: 'inventory:lowStock',
  ORDER_SUBSCRIBE: 'order:subscribe',
};

export const SOCKET_ROOMS = {
  admin: 'admin',
  user: (id) => `user:${id}`,
};