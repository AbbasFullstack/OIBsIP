export default function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="spread">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && <div className="row mt-4" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}