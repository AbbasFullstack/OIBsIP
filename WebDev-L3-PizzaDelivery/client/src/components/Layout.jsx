import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import Toaster from './Toaster.jsx';

export default function Layout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { count } = useCart();
  const { connected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <Link to="/" className="brand">
            <span>🍕</span> Slice
          </Link>

          <div className="nav-links">
            <NavLink to="/" className="nav-link" end>
              Menu
            </NavLink>
            <NavLink to="/build" className="nav-link">
              Build Your Own
            </NavLink>

            {isAuthenticated && (
              <NavLink to="/orders" className="nav-link">
                My Orders
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin/orders" className="nav-link">
                Admin
              </NavLink>
            )}

            <NavLink to="/cart" className="nav-link">
              Cart
              {count > 0 && <span className="cart-badge">{count}</span>}
            </NavLink>

            {isAuthenticated ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                Logout
              </button>
            ) : (
              <NavLink to="/login" className="btn btn-primary btn-sm">
                Login
              </NavLink>
            )}
          </div>
        </div>
      </nav>

      {/* Live-update indicator: reassures the user the tracking page is wired up. */}
      {isAuthenticated && (
        <div
          className="container small"
          style={{ paddingTop: 6, color: connected ? 'var(--green)' : 'var(--muted)' }}
        >
          {connected ? '● Live updates on' : '○ Connecting to live updates…'}
        </div>
      )}

      <main>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container spread">
          <span>© {new Date().getFullYear()} Slice Pizza Delivery — Oasis Infobyte Level 3</span>
          <span>Built with React, Express, MongoDB &amp; Socket.io</span>
        </div>
      </footer>

      <Toaster />
    </>
  );
}