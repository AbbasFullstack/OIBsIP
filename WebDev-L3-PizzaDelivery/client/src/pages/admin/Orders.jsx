import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { formatCurrency, formatDateTime, shortOrderId } from '../../utils/format.js';

// Must mirror ALLOWED_TRANSITIONS on the server. The admin can only submit a
// legal move, and the server re-validates regardless.
const NEXT_STATUS = {
  'Pending Payment': ['Cancelled'],
  Received: ['In Kitchen', 'Cancelled'],
  'In Kitchen': ['Sent to Delivery', 'Cancelled'],
  'Sent to Delivery': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

const STATUS_FILTERS = [
  '',
  'Received',
  'In Kitchen',
  'Sent to Delivery',
  'Delivered',
  'Cancelled',
  'Pending Payment',
];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filter, setFilter] = useState({ status: '', paymentStatus: '', search: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const { socket } = useSocket();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/orders', {
        params: {
          page: filter.page,
          limit: 10,
          status: filter.status || undefined,
          paymentStatus: filter.paymentStatus || undefined,
          search: filter.search || undefined,
        },
      });
      setOrders(data.orders);
      setPagination(data.pagination);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // New paid orders arrive instantly; we badge them rather than yanking the
  // list out from under the admin mid-action.
  useEffect(() => {
    if (!socket) return undefined;
    const onCreated = () => {
      setNewCount((n) => n + 1);
      toast.info('New order received 🎉');
    };
    const onStatus = () => load();
    socket.on('order:created', onCreated);
    socket.on('order:statusUpdated', onStatus);
    return () => {
      socket.off('order:created', onCreated);
      socket.off('order:statusUpdated', onStatus);
    };
  }, [socket, load, toast]);

  const advance = async (order, status) => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/orders/${order.id}/status`, { status });
      toast.success(data.message);
      setSelected((prev) => (prev && prev.id === order.id ? data.order : prev));
      load();
    } catch (err) {
      toast.error(err.friendlyMessage || 'Could not update status');
    } finally {
      setBusy(false);
    }
  };

  const refreshWithBadge = () => {
    setNewCount(0);
    load();
  };

  return (
    <div className="stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Order management</h2>
        <div className="row">
          {newCount > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={refreshWithBadge}>
              {newCount} new order{newCount > 1 ? 's' : ''} — refresh
            </button>
          )}
          <span className="muted small">{pagination.total} total</span>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <input
            className="input"
            style={{ maxWidth: 240 }}
            placeholder="Search by customer email or order id…"
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value, page: 1 })}
          />
          <select
            className="select"
            style={{ maxWidth: 190 }}
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value, page: 1 })}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All order statuses'}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ maxWidth: 170 }}
            value={filter.paymentStatus}
            onChange={(e) => setFilter({ ...filter, paymentStatus: e.target.value, page: 1 })}
          >
            <option value="">All payments</option>
            {['Paid', 'Pending', 'Failed', 'Refunded'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <Loader label="Loading orders…" />}

      {!loading && !error && orders.length === 0 && (
        <EmptyState icon="📦" title="No orders match" message="Try widening the filters." />
      )}

      {!loading && orders.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>#{shortOrderId(order.id)}</strong>
                    <div className="small muted">{formatDateTime(order.createdAt)}</div>
                  </td>
                  <td>
                    {order.customer?.name || '—'}
                    <div className="small muted">{order.customer?.email || ''}</div>
                  </td>
                  <td>{order.items.length}</td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  <td>
                    <StatusBadge status={order.paymentStatus} />
                  </td>
                  <td>
                    <StatusBadge status={order.orderStatus} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelected(order)}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={filter.page <= 1}
            onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
          >
            ← Prev
          </button>
          <span className="small muted">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={filter.page >= pagination.pages}
            onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
          >
            Next →
          </button>
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected ? `Order #${shortOrderId(selected.id)}` : ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div>
            <div className="row" style={{ gap: 8 }}>
              <StatusBadge status={selected.orderStatus} />
              <StatusBadge status={selected.paymentStatus} />
            </div>

            <p className="small muted mt-4">
              {selected.customer?.name} · {selected.customer?.email}
            </p>

            <h4>Items</h4>
            {selected.items.map((item, index) => (
              <div className="summary-line" key={index}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}

            <div className="summary-total">
              <span>Total</span>
              <span>{formatCurrency(selected.totalAmount)}</span>
            </div>

            <h4 className="mt-6">Delivery</h4>
            <p className="small">
              {selected.deliveryAddress.line1}
              {selected.deliveryAddress.line2 ? `, ${selected.deliveryAddress.line2}` : ''}
              <br />
              {selected.deliveryAddress.city} {selected.deliveryAddress.postalCode}
              <br />
              📞 {selected.deliveryAddress.phone}
            </p>

            <h4 className="mt-6">Advance status</h4>
            {(NEXT_STATUS[selected.orderStatus] || []).length === 0 ? (
              <p className="small muted">This order is in a terminal state.</p>
            ) : (
              <div className="row">
                {(NEXT_STATUS[selected.orderStatus] || []).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn-sm ${status === 'Cancelled' ? 'btn-danger' : 'btn-primary'}`}
                    disabled={busy || selected.paymentStatus !== 'Paid'}
                    onClick={() => advance(selected, status)}
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            )}

            {selected.paymentStatus !== 'Paid' && (
              <p className="small muted mt-4">
                Payment is not confirmed yet, so the order cannot be advanced.
              </p>
            )}

            <h4 className="mt-6">History</h4>
            {selected.statusHistory.map((entry, index) => (
              <div className="history-item" key={index}>
                <span>{entry.status}</span>
                <span className="muted small">{formatDateTime(entry.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}