import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/AuthShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Inline checks mirror the server rules so the user gets feedback instantly.
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (!/\d/.test(form.password)) return setError('Password must contain a number');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      setDone(true);
    } catch (err) {
      setError(err.friendlyMessage || 'Registration failed');
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  if (done) {
    return (
      <AuthShell title="Check your inbox 📬">
        <div className="alert alert-success">
          We sent a verification link to <strong>{form.email}</strong>. Click it to activate your
          account, then come back and log in.
        </div>
        <Link className="btn btn-primary btn-block" to="/login">
          Back to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Verify your email, then start ordering.">
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" name="name" value={form.name} onChange={onChange} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            required
          />
          <span className="small muted">At least 8 characters, including a number.</span>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            className="input"
            type="password"
            name="confirm"
            value={form.confirm}
            onChange={onChange}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="small center mt-4">
        Already registered?{' '}
        <Link to="/login" style={{ color: 'var(--brand-dark)', fontWeight: 600 }}>
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}