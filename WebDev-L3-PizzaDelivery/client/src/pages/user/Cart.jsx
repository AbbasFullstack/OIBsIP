import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useRazorpay from '../../hooks/useRazorpay.js';
import EmptyState from '../../components/EmptyState.jsx';
import { formatCurrency } from '../../utils/format.js';

const TAX_RATE = 0.05;
const DELIVERY_FEE = 40;
const FREE_DELIVERY_AT = 500;

// Local estimate only — it mirrors the server's pricing rules so the summary is
// instant. The authoritative total is always recomputed server-side.
const EMPTY_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  phone: '',
};

export default function Cart() {
  const { items, count, updateQuantity, removeItem, clearCart, toPayload } = useCart();
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { pay } = useRazorpay();

  const [address, setAddress] = useState({ ...EMPTY_ADDRESS, phone: '' });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const itemsTotal = items.reduce((sum, i) => sum + (i.unitPrice || 0) * i.quantity, 0);
    const tax = Math.round(itemsTotal * TAX_RATE);
    const delivery = itemsTotal >= FREE_DELIVERY_AT ? 0 : itemsTotal === 0 ? 0 : DELIVERY_FEE;
    return { itemsTotal, tax, delivery, total: itemsTotal + tax + delivery };
  }, [items]);

  const setField = (field) => (e) => setAddress({ ...address, [field]: e.target.value });

  const validate = () => {
    if (!isAuthenticated) return 'Please log in to place your order.';
    for (const key of ['line1', 'city', 'postalCode', 'phone']) {
      if (!address[key].trim()) return 'Please complete your delivery address.';
    }
    return '';
  };

  const handlePay = async () => {
    const problem = validate();
    if (problem) {
      if (!isAuthenticated) navigate('/login', { state: { from: '/cart' } });
      else setError(problem);
      return;
    }

    setError('');
    setPaying(true);

    await pay({
      items: toPayload(),
      address: {
        ...address,
        email: user?.email || '',
        name: user?.name || '',
      },
      onSuccess: (order) => {
        clearCart();
        toast.success('Payment successful — your order is confirmed!');
        navigate(`/orders/${order.id}`);
      },
      onFailure: (message) => {
        setError(message);
        toast.error(message);
        setPaying(false);
      },
    });

    setPaying(false);
  };

  if (count === 0) {
    return (
      <div className="container page">
        <h1>Your cart</h1>
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          message="Add a house favourite or build your own pizza to get started."
          action={
            <Link to="/" className="btn btn-primary">
              Browse the menu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container page">
      <h1>Your cart</h1>

      <div className="admin-shell">
        <section className="stack">
          {items.map((item) => (
            <article className="card" key={item.key}>
              <div className="spread">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    <span className={`badge ${item.kind === 'custom' ? 'badge-warn' : 'badge-neutral'}`}>
                      {item.kind === 'custom' ? 'Custom build' : 'Menu item'}
                    </span>
                  </div>
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {formatCurrency(item.unitPrice || 0)} each
                  </p>
                </div>

                <div className="row">
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                    >
                      −
                    </button>
                    <strong style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <strong style={{ minWidth: 80, textAlign: 'right' }}>
                    {formatCurrency((item.unitPrice || 0) * item.quantity)}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeItem(item.key)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <div className="card">
            <h3>Delivery address</h3>
            <div className="row" style={{ gap: 'var(--space-4)', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 260px' }}>
                <div className="field">
                  <label htmlFor="line1">Address line 1</label>
                  <input id="line1" className="input" value={address.line1} onChange={setField('line1')} />
                </div>
                <div className="field">
                  <label htmlFor="line2">Address line 2 (optional)</label>
                  <input id="line2" className="input" value={address.line2} onChange={setField('line2')} />
                </div>
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <div className="field">
                  <label htmlFor="city">City</label>
                  <input id="city" className="input" value={address.city} onChange={setField('city')} />
                </div>
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input id="state" className="input" value={address.state} onChange={setField('state')} />
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--space-4)' }}>
              <div className="field" style={{ flex: '1 1 160px' }}>
                <label htmlFor="postalCode">Postal code</label>
                <input
                  id="postalCode"
                  className="input"
                  value={address.postalCode}
                  onChange={setField('postalCode')}
                />
              </div>
              <div className="field" style={{ flex: '1 1 160px' }}>
                <label htmlFor="phone">Phone</label>
                <input id="phone" className="input" value={address.phone} onChange={setField('phone')} />
              </div>
            </div>
          </div>
        </section>

        <aside className="summary-card">
          <div className="card">
            <h3>Order summary</h3>

            <div className="summary-line">
              <span>Items ({count})</span>
              <span>{formatCurrency(totals.itemsTotal)}</span>
            </div>
            <div className="summary-line">
              <span>GST (5%)</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery fee</span>
              <span>{totals.delivery === 0 ? 'FREE' : formatCurrency(totals.delivery)}</span>
            </div>
            {totals.itemsTotal < FREE_DELIVERY_AT && (
              <p className="small muted" style={{ margin: 0 }}>
                Add {formatCurrency(FREE_DELIVERY_AT - totals.itemsTotal)} more for free delivery.
              </p>
            )}

            <div className="summary-total">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>

            {error && <div className="alert alert-error mt-4">{error}</div>}

            <button
              type="button"
              className="btn btn-primary btn-block mt-4"
              onClick={handlePay}
              disabled={paying}
            >
              {paying ? 'Processing…' : 'Proceed to payment'}
            </button>

            <p className="small muted center mt-4" style={{ marginBottom: 0 }}>
              Razorpay test mode — no real money moves.
            </p>

            {!isAuthenticated && (
              <p className="small center mt-4" style={{ marginBottom: 0 }}>
                <Link to="/login" state={{ from: '/cart' }} style={{ color: 'var(--brand-dark)' }}>
                  Log in
                </Link>{' '}
                to complete checkout.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}