import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell.jsx';
import api from '../../api/axios.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (!/\d/.test(form.password)) return setError('Password must contain a number');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { password: form.password });
      setDone(true);
    } catch (err) {
      setError(err.friendlyMessage || 'Could not reset password');
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <div className="alert alert-error">This reset link is missing its token.</div>
        <Link className="btn btn-secondary btn-block" to="/forgot-password">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <>
          <div className="alert alert-success">Your password has been updated.</div>
          <Link className="btn btn-primary btn-block" to="/login">
            Log in
          </Link>
        </>
      ) : (
        <>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm new password</label>
              <input
                id="confirm"
                className="input"
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}