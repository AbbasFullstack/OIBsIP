import { useToast } from '../context/ToastContext.jsx';

export default function Toaster() {
  const { toasts, remove } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => remove(t.id)}
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}