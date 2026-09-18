import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios.js';
import { useCart } from '../../context/CartContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { SkeletonGrid } from '../../components/Loader.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { formatCurrency } from '../../utils/format.js';

const PIZZA_EMOJI = ['🍕', '🍕', '🍕', '🍕', '🍕', '🍕'];

export default function Dashboard() {
  const [pizzas, setPizzas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get('/pizzas')
      .then(({ data }) => active && setPizzas(data.pizzas))
      .catch((err) => active && setError(err.friendlyMessage || 'Could not load the menu'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    return pizzas.filter((p) => {
      if (filter === 'veg' && !p.isVeg) return false;
      if (filter === 'nonveg' && p.isVeg) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [pizzas, filter, search]);

  const handleAdd = (pizza) => {
    addItem({ kind: 'menu', pizzaId: pizza.id, name: pizza.name, unitPrice: pizza.price, isVeg: pizza.isVeg });
    toast.success(`${pizza.name} added to cart`);
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <h1>Hot, handcrafted pizza — delivered fast.</h1>
          <p className="muted">
            Pick a house favourite, or build your own from bases, sauces, cheeses and toppings. Track
            every order live from the kitchen to your door.
          </p>
          <div className="row mt-4">
            <Link to="/build" className="btn btn-primary">
              Build your own pizza
            </Link>
            <a href="#menu" className="btn btn-secondary">
              Browse the menu
            </a>
          </div>
        </div>
      </section>

      <div className="container page" id="menu">
        <div className="spread" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 style={{ margin: 0 }}>Our menu</h2>
          <div className="row">
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Search pizzas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="row" style={{ gap: 6 }}>
              {[
                ['all', 'All'],
                ['veg', 'Veg'],
                ['nonveg', 'Non-veg'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`step-pill ${filter === value ? 'active' : ''}`}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading && <SkeletonGrid count={6} />}

        {!loading && !error && visible.length === 0 && (
          <EmptyState title="No pizzas match your filters" message="Try a different search or filter." />
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid">
            {visible.map((pizza, index) => (
              <article key={pizza.id} className="card card-hover stack" style={{ gap: 'var(--space-3)' }}>
                <div className="pizza-thumb" aria-hidden>
                  {PIZZA_EMOJI[index % PIZZA_EMOJI.length]}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge ${pizza.isVeg ? 'badge-veg' : 'badge-nonveg'}`}>
                    {pizza.isVeg ? 'Veg' : 'Non-veg'}
                  </span>
                  {pizza.discountPercent > 0 && (
                    <span className="badge badge-warn">{pizza.discountPercent}% off</span>
                  )}
                  {!pizza.inStock && <span className="badge badge-neutral">Sold out</span>}
                </div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>{pizza.name}</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    {pizza.description}
                  </p>
                </div>
                <div className="spread" style={{ marginTop: 'auto' }}>
                  <span className="pizza-price">{formatCurrency(pizza.price)}</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!pizza.inStock}
                    onClick={() => (isAuthenticated ? handleAdd(pizza) : navigate('/login'))}
                  >
                    {pizza.inStock ? 'Add to cart' : 'Unavailable'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}