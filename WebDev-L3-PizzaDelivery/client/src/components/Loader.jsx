export default function Loader({ label = 'Loading…', size = 22 }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: '32px 0' }}>
      <span className="spinner" style={{ width: size, height: size }} />
      <span className="muted">{label}</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card stack">
      <div className="skeleton" style={{ height: 90 }} />
      <div className="skeleton" style={{ width: '70%' }} />
      <div className="skeleton" style={{ width: '45%' }} />
      <div className="skeleton" style={{ height: 34, borderRadius: 999 }} />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}