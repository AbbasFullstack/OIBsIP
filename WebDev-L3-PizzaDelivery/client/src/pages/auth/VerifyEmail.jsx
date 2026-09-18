import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell.jsx';
import api from '../../api/axios.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ status: 'working', message: 'Verifying your email…' });
  const [resendEmail, setResendEmail] = useState('');
  const [resendNote, setResendNote] = useState('');
  // Guard against React StrictMode's double effect in development.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState({ status: 'error', message: 'This verification link is missing its token.' });
      return;
    }

    api
      .post('/auth/verify-email', { token })
      .then(({ data }) => setState({ status: 'success', message: data.message }))
      .catch((err) =>
        setState({ status: 'error', message: err.friendlyMessage || 'Verification failed' }),
      );
  }, [token]);

  const resend = async (e) => {
    e.preventDefault();
    const { data } = await api.post('/auth/resend-verification', { email: resendEmail });
    setResendNote(data.message);
  };

  const alertClass =
    state.status === 'success' ? 'success' : state.status === 'error' ? 'error' : 'info';

  return (
    <AuthShell title="Email verification">
      <div className={`alert alert-${alertClass}`}>{state.message}</div>

      {state.status === 'success' && (
        <Link className="btn btn-primary btn-block" to="/login">
          Continue to login
        </Link>
      )}

      {state.status === 'error' && (
        <form onSubmit={resend}>
          <p className="small muted">Links expire. Enter your email and we&apos;ll send a fresh one.</p>
          <div className="field">
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-secondary btn-block">Resend verification link</button>
          {resendNote && <div className="alert alert-info mt-4">{resendNote}</div>}
        </form>
      )}
    </AuthShell>
  );
}