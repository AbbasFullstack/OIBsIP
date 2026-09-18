import { useCallback } from 'react';
import api from '../api/axios.js';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise = null;

// Loads the Razorpay checkout script on demand (once) rather than shipping a
// third-party script in index.html.
const loadScript = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      document.body.appendChild(el);
    });
  }
  return scriptPromise;
};

/**
 * Creates the order server-side, opens Razorpay Checkout in test mode, and
 * verifies the signature server-side on success.
 *
 * `onSuccess(order)` receives the confirmed order; `onFailure(message)` is
 * called for dismissal or verification errors.
 */
export default function useRazorpay() {
  const pay = useCallback(async ({ items, address, onSuccess, onFailure }) => {
    const loaded = await loadScript();
    if (!loaded) {
      onFailure?.('Could not load the payment gateway. Check your connection.');
      return;
    }

    let created;
    try {
      const { data } = await api.post('/orders', { items, deliveryAddress: address });
      created = data;
    } catch (err) {
      // Surfaces stock conflicts ("Only 2 × Paneer left…") verbatim.
      onFailure?.(err.friendlyMessage || 'Could not create your order');
      return;
    }

    const { order, payment } = created;

    if (!payment.keyId) {
      onFailure?.('Payments are not configured on the server.');
      return;
    }

    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      name: 'Slice Pizza Delivery',
      description: `Order #${String(order.id).slice(-8).toUpperCase()}`,
      order_id: payment.razorpayOrderId,
      prefill: {
        name: address.name || '',
        email: address.email || '',
        contact: address.phone || '',
      },
      theme: { color: '#e4572e' },
      handler: async (response) => {
        // Never trust the client-side success callback alone: the server
        // recomputes the HMAC signature before marking the order paid.
        try {
          const { data } = await api.post('/payments/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          onSuccess?.(data.order);
        } catch (err) {
          onFailure?.(err.friendlyMessage || 'Payment verification failed');
        }
      },
      modal: {
        ondismiss: () => onFailure?.('Payment cancelled. Your order is saved as unpaid.'),
      },
    });

    checkout.on('payment.failed', (resp) => {
      onFailure?.(resp?.error?.description || 'Payment failed. Please try again.');
    });

    checkout.open();
  }, []);

  return { pay };
}