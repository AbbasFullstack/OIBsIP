import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios.js';
import { useSocket } from '../../context/SocketContext.jsx';
import Loader from '../../components/Loader.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatCurrency, formatDateTime, shortOrderId } from '../../utils/format.js';

// Mirrors the server's happy-path progression. The UI advances along this list
// as the socket reports changes.
const FLOW = ['Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'];

export default function OrderTracking() {
  const { id } = useParams();
  const { socket, connected } = useSocket();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const orderRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data.order);
      orderRef.current = data.order;
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load this order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: subscribe to this order's room and patch state on push.
  useEffect(() => {
    if (!socket) return undefined;
    socket.emit('order:subscribe', id);

    const onStatus = (payload) => {
      if (String(payload.orderId) !== String(id)) return;
      setOrder((prev) =>
        prev ? { ...prev, orderStatus: payload.orderStatus, statusHistory: payload.statusHistory } : prev,
      );
    };

    socket.on('order:statusUpdated', onStatus);
    return () => socket.off('order:statusUpdated', onStatus);
  }, [socket, id]);

  // Fallback polling: if the socket is down, keep the page fresh anyway.
  useEffect(() => {
    if (connected) return undefined;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [connected, load]);

  if (loading) return <div className="container page"><Loader label="Loading your order…" /></div>;
  if (error) {
    return (
      <div className="container page">
        <div className="alert alert-error">{error}</div>
        <Link to="/orders" className="btn btn-secondary">
          ← Back to my orders
        </Link>
      </div>
    );
  }
  if (!order) return null;

  const currentIndex = FLOW.indexOf(order.orderStatus);
  const cancelled = order.orderStatus === 'Cancelled';

  return (
    <div className="container page">
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>Order #{shortOrderId(order.id)}</h1>
          <span className="muted small">Placed {formatDateTime(order.createdAt)}</span>
        </div>
        <div className="row">
          <StatusBadge status={order.orderStatus} />
          <StatusBadge status={order.paymentStatus} />
        </div>
      </div>

      <div className="card mt-4">
        {cancelled ? (
          <div className="alert alert-error" style={{ marginBottom: 0 }}>
            This order was cancelled. Contact support if this was unexpected.
          </div>
        ) : (
          <>
            <div className="spread">
              <h3 style={{ margin: 0 }}>Live progress</h3>
              <span className="small" style={{ color: connected ? 'var(--green)' : 'var(--muted)' }}>
                {connected ? '● Live' : '○ Reconnecting…'}
              </span>
            </div>

            <div className="timeline">
              {FLOW.map((step, index) => {
                const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : '';
                return (
                  <div className={`timeline-step ${state}`} key={step}>
                    <div className="timeline-dot">{index < currentIndex ? '✓' : index + 1}</div>
                    <div className="timeline-label">{step}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="admin-shell mt-6">
        <section className="stack">
          <div className="card">
            <h3>Items</h3>
            {order.items.map((item, index) => (
              <div className="summary-line" key={index}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}

            <div className="summary-total">
              <span>Total</span>
              <span>{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>

          <div className="card">
            <h3>Status history</h3>
            {order.statusHistory.map((entry, index) => (
              <div className="history-item" key={index}>
                <span>
                  <StatusBadge status={entry.status} />
                  {entry.note && <span className="muted small"> — {entry.note}</span>}
                </span>
                <span className="muted small">{formatDateTime(entry.at)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="summary-card">
          <div className="card">
            <h3>Delivery details</h3>
            <p className="small" style={{ marginBottom: 4 }}>
              <strong>{order.deliveryAddress.line1}</strong>
              {order.deliveryAddress.line2 && <><br />{order.deliveryAddress.line2}</>}
              <br />
              {order.deliveryAddress.city} {order.deliveryAddress.postalCode}
              {order.deliveryAddress.state && `, ${order.deliveryAddress.state}`}
              <br />
              📞 {order.deliveryAddress.phone}
            </p>

            <div className="summary-line">
              <span>Items</span>
              <span>{formatCurrency(order.itemsTotal)}</span>
            </div>
            <div className="summary-line">
              <span>Tax</span>
              <span>{formatCurrency(order.taxAmount)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <span>{order.deliveryFee === 0 ? 'FREE' : formatCurrency(order.deliveryFee)}</span>
            </div>
            <div className="summary-total">
              <span>Paid</span>
              <span>{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </aside>
      </div>

      <p className="mt-6">
        <Link to="/orders" className="muted">
          ← Back to my orders
        </Link>
      </p>
    </div>
  );
}