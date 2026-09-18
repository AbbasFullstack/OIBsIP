import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container page center">
      <div style={{ fontSize: '4rem' }}>🍕</div>
      <h1>404 — page not found</h1>
      <p className="muted">That slice doesn&apos;t exist. Let&apos;s get you back to the menu.</p>
      <Link to="/" className="btn btn-primary">
        Back to the menu
      </Link>
    </div>
  );
}