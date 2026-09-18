import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios.js';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Loader from '../../components/Loader.jsx';
import { formatCurrency } from '../../utils/format.js';

// The four builder stages, in order. Base/sauce/cheese are single-select,
// veggie is multi-select.
const STEPS = [
  { key: 'base', label: '1. Choose base', multi: false },
  { key: 'sauce', label: '2. Choose sauce', multi: false },
  { key: 'cheese', label: '3. Choose cheese', multi: false },
  { key: 'veggie', label: '4. Add toppings', multi: true },
];

export default function CustomPizzaBuilder() {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState({ base: null, sauce: null, cheese: null, veggie: [] });
  const [quantity, setQuantity] = useState(1);

  const { addItem } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api
      .get('/ingredients')
      .then(({ data }) => active && setGrouped(data.grouped))
      .catch((err) => active && setError(err.friendlyMessage || 'Could not load ingredients'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const allSelected = useMemo(() => {
    const parts = [
      selection.base && grouped.base?.find((i) => i.id === selection.base),
      selection.sauce && grouped.sauce?.find((i) => i.id === selection.sauce),
      selection.cheese && grouped.cheese?.find((i) => i.id === selection.cheese),
      ...selection.veggie.map((id) => grouped.veggie?.find((i) => i.id === id)).filter(Boolean),
    ].filter(Boolean);
    const price = parts.reduce((sum, p) => sum + p.price, 0);
    return { parts, price };
  }, [selection, grouped]);

  const canAdd =
    Boolean(selection.base && selection.sauce && selection.cheese) && allSelected.parts.length > 0;

  const toggle = (categoryKey, item) => {
    const stepDef = STEPS.find((s) => s.key === categoryKey);
    setSelection((prev) => {
      if (stepDef.multi) {
        const list = prev[categoryKey];
        return {
          ...prev,
          [categoryKey]: list.includes(item.id)
            ? list.filter((id) => id !== item.id)
            : [...list, item.id],
        };
      }
      return { ...prev, [categoryKey]: prev[categoryKey] === item.id ? null : item.id };
    });
  };

  const handleAdd = () => {
    if (!canAdd) return toast.error('Pick a base, sauce, and cheese first');
    addItem(
      {
        kind: 'custom',
        baseId: selection.base,
        sauceId: selection.sauce,
        cheeseId: selection.cheese,
        veggieIds: selection.veggie,
        name: 'Custom pizza',
        unitPrice: allSelected.price,
      },
      quantity,
    );
    toast.success('Custom pizza added to cart');
    navigate('/cart');
  };

  if (loading) return <div className="container page"><Loader label="Loading ingredients…" /></div>;
  if (error) return <div className="container page"><div className="alert alert-error">{error}</div></div>;

  const current = STEPS[step];
  const options = grouped[current.key] || [];

  return (
    <div className="container page">
      <h1>Build your own pizza</h1>
      <p className="muted">Pick one option per step. Toppings are optional and stack up.</p>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`step-pill ${i === step ? 'active' : ''}`}
            onClick={() => setStep(i)}
          >
            {s.label}
            {selecheck(s, selection) && ' ✓'}
          </button>
        ))}
      </div>

      <div className="admin-shell">
        <section>
          <div className="option-grid">
            {options.map((item) => {
              const selected = current.multi
                ? selection[current.key].includes(item.id)
                : selection[current.key] === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`option ${selected ? 'selected' : ''}`}
                  disabled={!item.inStock}
                  onClick={() => toggle(current.key, item)}
                >
                  <div className="spread">
                    <strong>{item.name}</strong>
                    <span className="pizza-price" style={{ fontSize: '1rem' }}>
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {item.inStock ? `${item.stock} in stock` : 'Out of stock'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="row mt-6">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              ← Previous
            </button>
            {step < STEPS.length - 1 && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s + 1)}>
                Next →
              </button>
            )}
          </div>
        </section>

        <aside className="summary-card">
          <div className="card">
            <h3>Your pizza</h3>

            {allSelected.parts.length === 0 && <p className="small muted">Nothing selected yet.</p>}

            {allSelected.parts.map((p) => (
              <div className="summary-line" key={p.id}>
                <span>{p.name}</span>
                <span>{formatCurrency(p.price)}</span>
              </div>
            ))}

            {allSelected.parts.length > 0 && (
              <>
                <div className="summary-total">
                  <span>Unit price</span>
                  <span>{formatCurrency(allSelected.price)}</span>
                </div>

                <div className="row mt-4" style={{ justifyContent: 'space-between' }}>
                  <span className="small muted">Quantity</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      −
                    </button>
                    <strong>{quantity}</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <button type="button" className="btn btn-primary btn-block mt-4" onClick={handleAdd}>
                  Add to cart — {formatCurrency(allSelected.price * quantity)}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <p className="small muted mt-6">
        Missing something? <Link to="/">Browse the house menu →</Link>
      </p>
    </div>
  );
}

function selecheck(stepDef, selection) {
  if (stepDef.multi) return selection[stepDef.key].length > 0;
  return Boolean(selection[stepDef.key]);
}