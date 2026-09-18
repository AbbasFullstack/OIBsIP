import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', timeout = 4000) => {
      const id = nextId++;
      setToasts((list) => [...list, { id, message, type }]);
      if (timeout) setTimeout(() => remove(id), timeout);
      return id;
    },
    [remove],
  );

  const value = useMemo(
    () => ({
      toasts,
      push,
      success: (m, t) => push(m, 'success', t),
      error: (m, t) => push(m, 'error', t),
      info: (m, t) => push(m, 'info', t),
      remove,
    }),
    [toasts, push, remove],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}