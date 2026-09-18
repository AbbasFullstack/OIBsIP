import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Shared chrome for the admin console. The nav is separate from the customer
// navbar so it is always obvious which area you are in.
export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="container page">
      <div className="spread" style={{ marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Admin Console</h1>
          <span className="muted small">Signed in as {user?.email}</span>
        </div>
        <div className="row">
          <Link to="/" className="btn btn-secondary btn-sm">
            ← Storefront
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="admin-shell">
        <aside className="admin-nav">
          <NavLink to="/admin/orders" className="nav-link">
            📦 Order Management
          </NavLink>
          <NavLink to="/admin/inventory" className="nav-link">
            🧺 Inventory
          </NavLink>
        </aside>
        <section>
          <Outlet />
        </section>
      </div>
    </div>
  );
}