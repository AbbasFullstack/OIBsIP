export default function EmptyState({ icon = '🍕', title, message, action }) {
  return (
    <div className="card center" style={{ padding: '48px 24px' }}>
      <div style={{ fontSize: '3rem' }}>{icon}</div>
      <h3 style={{ marginTop: 12 }}>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}