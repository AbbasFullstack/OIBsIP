import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'slice.cart';

const makeKey = (item) =>
  item.kind === 'menu'
    ? `menu:${item.pizzaId}`
    : `custom:${item.baseId}:${item.sauceId}:${item.cheeseId}:${[...(item.veggieIds || [])].sort().join(',')}`;

// Cart holds only ids + quantities. Prices are always recomputed by the server,
// so the client never sends a price and cannot be trusted to influence it.
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item, quantity = 1) => {
    const key = makeKey(item);
    setItems((list) => {
      const existing = list.find((i) => i.key === key);
      if (existing) {
        return list.map((i) => (i.key === key ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...list, { ...item, key, quantity }];
    });
  };

  const updateQuantity = (key, quantity) =>
    setItems((list) =>
      list
        .map((i) => (i.key === key ? { ...i, quantity: Math.max(1, quantity) } : i))
        .filter((i) => i.quantity > 0),
    );

  const removeItem = (key) => setItems((list) => list.filter((i) => i.key !== key));
  const clearCart = () => setItems([]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  // Convert to exactly the shape POST /api/orders expects.
  const toPayload = () =>
    items.map((i) =>
      i.kind === 'menu'
        ? { kind: 'menu', pizzaId: i.pizzaId, quantity: i.quantity }
        : {
            kind: 'custom',
            baseId: i.baseId,
            sauceId: i.sauceId,
            cheeseId: i.cheeseId,
            veggieIds: i.veggieIds || [],
            quantity: i.quantity,
          },
    );

  const value = useMemo(
    () => ({ items, count, addItem, updateQuantity, removeItem, clearCart, toPayload }),
    [items, count],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}