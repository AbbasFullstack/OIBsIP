import { Link } from 'react-router-dom';

// Shared frame for every auth screen: a branded card floating on the warm
// background, with links back to the storefront.
export default function AuthShell({ title, subtitle, children, wide = false }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-5)' }}>
      <div className="card" style={{ width: '100%', maxWidth: wide ? 520 : 420, boxShadow: 'var(--shadow-lg)' }}>
        <Link to="/" className="brand" style={{ marginBottom: 'var(--space-4)' }}>
          <span>🍕</span> Slice
        </Link>
        <h2>{title}</h2>
        {subtitle && <p className="muted small">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}