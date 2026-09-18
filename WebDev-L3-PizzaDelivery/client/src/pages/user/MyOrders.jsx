import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import Loader from '../../components/Loader.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatCurrency, formatDateTime, shortOrderId } from '../../utils/format.js';

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/orders/mine')
      .then(({ data }) => active && setOrders(data.orders))
      .catch((err) => active && setError(err.friendlyMessage || 'Could not load your orders'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="container page"><Loader label="Loading your orders…" /></div>;

  return (
    <div className="container page">
      <h1>My orders</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && orders.length === 0 && (
        <EmptyState
          icon="🧾"
          title="No orders yet"
          message="Your past pizzas will show up here."
          action={
            <Link to="/" className="btn btn-primary">
              Order something
            </Link>
          }
        />
      )}

      <div className="stack">
        {orders.map((order) => (
          <article className="card card-hover" key={order.id}>
            <div className="spread">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <h3 style={{ margin: 0 }}>#{shortOrderId(order.id)}</h3>
                  <StatusBadge status={order.orderStatus} />
                  <StatusBadge status={order.paymentStatus} />
                </div>
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  {formatDateTime(order.createdAt)} · {order.items.length} item
                  {order.items.length > 1 ? 's' : ''}
                </p>
              </div>

              <div className="row">
                <strong>{formatCurrency(order.totalAmount)}</strong>
                <Link to={`/orders/${order.id}`} className="btn btn-secondary btn-sm">
                  Track order
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}