import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/AuthShell.jsx';
import api from '../../api/axios.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    // The API always returns success here (to avoid account enumeration), so we
    // show the same confirmation regardless.
    try {
      await api.post('/auth/forgot-password', { email });
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <>
          <div className="alert alert-success">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </div>
          <Link className="btn btn-secondary btn-block" to="/login">
            Back to login
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}