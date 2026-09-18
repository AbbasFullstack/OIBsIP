import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

// Deliberately a distinct, darker screen: admin access should never be confused
// with the customer login. Posts to the admin endpoint, which rejects any
// account whose role is not `admin`.
export default function AdminLogin() {
  const { adminLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminLogin(form.email, form.password);
      toast.success('Admin session started');
      navigate('/admin/orders', { replace: true });
    } catch (err) {
      setError(err.friendlyMessage || 'Admin login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-5)',
        background: 'linear-gradient(160deg,#2b2118 0%,#4a382b 100%)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: '1.6rem' }}>🛠️</span>
          <h2 style={{ margin: 0 }}>Admin Console</h2>
        </div>
        <p className="muted small">Restricted area — staff credentials only.</p>

        {error && <div className="alert alert-error mt-4">{error}</div>}

        <form onSubmit={onSubmit} className="mt-4">
          <div className="field">
            <label htmlFor="email">Admin email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in as admin'}
          </button>
        </form>

        <p className="small muted center mt-4">
          <Link to="/login">← Customer login</Link>
        </p>
      </div>
    </div>
  );
}