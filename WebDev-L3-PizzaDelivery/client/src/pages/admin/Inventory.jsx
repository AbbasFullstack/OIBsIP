import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import { formatCurrency } from '../../utils/format.js';

const CATEGORIES = ['base', 'sauce', 'cheese', 'veggie'];

const EMPTY_FORM = {
  name: '',
  category: 'veggie',
  price: '',
  stock: '',
  lowStockThreshold: '',
  isVeg: true,
};

export default function AdminInventory() {
  const [data, setData] = useState({ ingredients: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', form }
  const [busy, setBusy] = useState(false);
  const { socket } = useSocket();
  const toast = useToast();

  const load = async () => {
    try {
      const res = await api.get('/admin/inventory');
      setData({ ingredients: res.data.ingredients, summary: res.data.summary });
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Refresh whenever the server reports stock or catalog changes.
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdate = () => load();
    socket.on('inventory:updated', onUpdate);
    socket.on('inventory:lowStock', onUpdate);
    return () => {
      socket.off('inventory:updated', onUpdate);
      socket.off('inventory:lowStock', onUpdate);
    };
  }, [socket]);

  const grouped = useMemo(
    () =>
      CATEGORIES.reduce((acc, cat) => {
        acc[cat] = data.ingredients.filter((i) => i.category === cat);
        return acc;
      }, {}),
    [data.ingredients],
  );

  const saveModal = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { mode, form } = modal;
    const payload = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      lowStockThreshold: Number(form.lowStockThreshold || 0),
      isVeg: form.isVeg,
    };

    try {
      if (mode === 'create') {
        await api.post('/admin/ingredients', { ...payload, stock: Number(form.stock || 0) });
        toast.success(`${form.name} added to inventory`);
      } else {
        await api.patch(`/admin/ingredients/${form.id}`, payload);
        // Stock has its own endpoint so the decrement rules stay in one place.
        if (form.stock !== '' && Number(form.stock) !== form.originalStock) {
          await api.patch(`/admin/ingredients/${form.id}/stock`, { stock: Number(form.stock) });
        }
        toast.success(`${form.name} updated`);
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const saveStock = async (ingredient, value) => {
    const stock = Number(value);
    if (Number.isNaN(stock) || stock < 0) return;
    try {
      await api.patch(`/admin/ingredients/${ingredient.id}/stock`, { stock });
      toast.success(`${ingredient.name} stock set to ${stock}`);
    } catch (err) {
      toast.error(err.friendlyMessage || 'Could not update stock');
    }
  };

  const remove = async (ingredient) => {
    if (!window.confirm(`Delete ${ingredient.name}? This cannot be undone.`)) return;
    try {
      const { data: res } = await api.delete(`/admin/ingredients/${ingredient.id}`);
      toast.info(res.message);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage || 'Delete failed');
    }
  };

  if (loading) return <Loader label="Loading inventory…" />;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Inventory</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setModal({ mode: 'create', form: { ...EMPTY_FORM } })}
        >
          + Add ingredient
        </button>
      </div>

      {data.summary && (
        <div className="stat-strip">
          <div className="stat">
            <div className="muted small">Total items</div>
            <div className="stat-value">{data.summary.total}</div>
          </div>
          <div className="stat">
            <div className="muted small">Low stock</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>
              {data.summary.lowStock}
            </div>
          </div>
          <div className="stat">
            <div className="muted small">Out of stock</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>
              {data.summary.outOfStock}
            </div>
          </div>
          <div className="stat">
            <div className="muted small">Stock value</div>
            <div className="stat-value">{formatCurrency(data.summary.stockValue)}</div>
          </div>
        </div>
      )}

      {CATEGORIES.map((cat) => (
        <div className="card" key={cat} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <strong style={{ textTransform: 'capitalize' }}>{cat}s</strong>
            <span className="muted small"> ({grouped[cat]?.length || 0})</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Threshold</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(grouped[cat] || []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    {!item.isVeg && <span className="badge badge-nonveg" style={{ marginLeft: 8 }}>Non-veg</span>}
                  </td>
                  <td>{formatCurrency(item.price)}</td>
                  <td style={{ width: 130 }}>
                    {/* Commits on blur so we don't fire a request per keystroke. */}
                    <input
                      className="input"
                      type="number"
                      min="0"
                      style={{ padding: '6px 10px' }}
                      defaultValue={item.stock}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== item.stock) saveStock(item, e.target.value);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                    />
                  </td>
                  <td>{item.lowStockThreshold}</td>
                  <td>
                    {item.isOutOfStock ? (
                      <span className="badge badge-nonveg">Out</span>
                    ) : item.isLowStock ? (
                      <span className="badge badge-warn">Low</span>
                    ) : (
                      <span className="badge badge-veg">OK</span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setModal({
                            mode: 'edit',
                            form: {
                              ...item,
                              stock: item.stock,
                              originalStock: item.stock,
                            },
                          })
                        }
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(item)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(grouped[cat] || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="muted center">
                    No items in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <Modal
        open={Boolean(modal)}
        title={modal?.mode === 'create' ? 'Add ingredient' : `Edit ${modal?.form.name}`}
        onClose={() => setModal(null)}
      >
        {modal && (
          <form onSubmit={saveModal}>
            <div className="field">
              <label htmlFor="ing-name">Name</label>
              <input
                id="ing-name"
                className="input"
                value={modal.form.name}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ing-cat">Category</label>
              <select
                id="ing-cat"
                className="select"
                value={modal.form.category}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, category: e.target.value } })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ gap: 'var(--space-4)' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="ing-price">Price (₹)</label>
                <input
                  id="ing-price"
                  className="input"
                  type="number"
                  min="0"
                  value={modal.form.price}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, price: e.target.value } })}
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="ing-stock">Stock</label>
                <input
                  id="ing-stock"
                  className="input"
                  type="number"
                  min="0"
                  value={modal.form.stock}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, stock: e.target.value } })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ing-thresh">Low stock threshold</label>
              <input
                id="ing-thresh"
                className="input"
                type="number"
                min="0"
                value={modal.form.lowStockThreshold}
                onChange={(e) =>
                  setModal({ ...modal, form: { ...modal.form, lowStockThreshold: e.target.value } })
                }
              />
            </div>
            <label className="row" style={{ gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={modal.form.isVeg}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, isVeg: e.target.checked } })}
              />
              <span>Vegetarian</span>
            </label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}