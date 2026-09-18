import mongoose from 'mongoose';
import Ingredient from '../models/Ingredient.js';
import Pizza from '../models/Pizza.js';
import ApiError from '../utils/ApiError.js';
import { PRICING } from '../config/constants.js';
import logger from '../utils/logger.js';

const isObjectId = (v) => mongoose.isValidObjectId(v);

// Loads every ingredient referenced anywhere in the cart in a single round trip,
// keyed by string id for O(1) lookups during resolution.
const loadIngredients = async (ids) => {
  const unique = [...new Set(ids.filter(isObjectId).map(String))];
  const docs = await Ingredient.find({ _id: { $in: unique } });
  return new Map(docs.map((d) => [String(d._id), d]));
};

const requireIngredient = (map, id, label) => {
  const doc = map.get(String(id));
  if (!doc) throw ApiError.badRequest(`Unknown ${label} selected`);
  if (!doc.isAvailable || doc.stock <= 0) {
    throw ApiError.conflict(`${doc.name} is currently out of stock`, { ingredient: doc.name });
  }
  return doc;
};

const buildCustomItem = (raw, map) => {
  const base = requireIngredient(map, raw.baseId, 'base');
  const sauce = requireIngredient(map, raw.sauceId, 'sauce');
  const cheese = requireIngredient(map, raw.cheeseId, 'cheese');
  const veggieIds = [...new Set((raw.veggieIds || []).map(String))];
  const veggies = veggieIds.map((id) => requireIngredient(map, id, 'topping'));

  // One unit of every selected ingredient is consumed per pizza.
  const parts = [base, sauce, cheese, ...veggies];
  const unitPrice = parts.reduce((sum, p) => sum + p.price, 0);

  return {
    kind: 'custom',
    name: `Custom — ${base.name} / ${sauce.name} / ${cheese.name}`,
    ingredientIds: parts.map((p) => p._id),
    stockUsage: parts.map((p) => ({ ingredient: p._id, quantity: 1 })),
    unitPrice,
    quantity: raw.quantity,
    _parts: parts,
    _name: base.name,
  };
};

const buildMenuItem = (raw, map, pizza) => {
  const { price } = pizza.computePricing();
  const parts = [pizza.base, pizza.sauce, pizza.cheese, ...pizza.veggies].filter(Boolean);
  parts.forEach((p) => requireIngredient(map, p._id, 'ingredient'));

  return {
    kind: 'menu',
    pizza: pizza._id,
    name: pizza.name,
    ingredientIds: parts.map((p) => p._id),
    stockUsage: parts.map((p) => ({ ingredient: p._id, quantity: 1 })),
    unitPrice: price,
    quantity: raw.quantity,
    _parts: parts,
  };
};

// Validates the cart, resolves every price server-side, and aggregates how much
// stock each ingredient needs. Any client-supplied price is ignored entirely.
export const resolveCart = async (cartItems) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw ApiError.badRequest('Your cart is empty');
  }

  // Pizzas must be loaded first: their ingredient refs are only known from the
  // document, so a menu item's ingredient ids cannot be collected up front.
  const menuIds = cartItems.filter((i) => i.kind === 'menu').map((i) => i.pizzaId);
  const pizzas = await Pizza.find({ _id: { $in: menuIds.filter(isObjectId) } }).populate(
    'base sauce cheese veggies',
  );
  const pizzaMap = new Map(pizzas.map((p) => [String(p._id), p]));

  const customIds = [];
  cartItems
    .filter((i) => i.kind !== 'menu')
    .forEach((i) => customIds.push(i.baseId, i.sauceId, i.cheeseId, ...(i.veggieIds || [])));

  const pizzaIngredientIds = pizzas.flatMap((p) =>
    [p.base, p.sauce, p.cheese, ...p.veggies].filter(Boolean).map((x) => x._id),
  );

  const map = await loadIngredients([...customIds, ...pizzaIngredientIds]);

  const items = [];
  for (const raw of cartItems) {
    if (raw.kind === 'menu') {
      const pizza = pizzaMap.get(String(raw.pizzaId));
      if (!pizza) throw ApiError.badRequest('Unknown pizza selected');
      if (!pizza.isAvailable) throw ApiError.conflict(`${pizza.name} is currently unavailable`);
      items.push(buildMenuItem(raw, map, pizza));
    } else {
      items.push(buildCustomItem(raw, map));
    }
  }

  // Aggregate required stock once, then compare against the loaded snapshot so
  // the user learns about the shortage before any payment happens.
  const required = new Map();
  for (const item of items) {
    for (const { ingredient, quantity } of item.stockUsage) {
      const key = String(ingredient);
      required.set(key, (required.get(key) || 0) + quantity * item.quantity);
    }
  }

  for (const [id, needed] of required) {
    const doc = map.get(id);
    if (!doc || doc.stock < needed) {
      const name = doc?.name || 'An ingredient';
      throw ApiError.conflict(
        `Only ${doc?.stock ?? 0} × ${name} left in stock, but your order needs ${needed}`,
        { ingredient: name, available: doc?.stock ?? 0, required: needed },
      );
    }
  }

  const cleanItems = items.map(({ _parts, ...rest }) => rest);
  return { items: cleanItems, requiredStock: required };
};

// Money is always derived here from the resolved items — never from the client.
export const computeTotals = (items) => {
  const itemsTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const taxAmount = Math.round(itemsTotal * PRICING.taxRate);
  const deliveryFee = itemsTotal >= PRICING.freeDeliveryThreshold ? 0 : PRICING.deliveryFee;
  const totalAmount = itemsTotal + taxAmount + deliveryFee;
  return { itemsTotal, taxAmount, deliveryFee, totalAmount, currency: PRICING.currency };
};

// Atomically decrement stock for a paid order. The `stock: { $gte: qty }` guard
// means a concurrent order can never drive a value negative. Without a session
// we undo our own partial writes on the way out, so the caller never sees stock
// consumed for an order that failed to confirm.
export const decrementStockForOrder = async (order, session) => {
  const required = new Map();
  for (const item of order.items) {
    for (const { ingredient, quantity } of item.stockUsage) {
      const key = String(ingredient);
      required.set(key, (required.get(key) || 0) + quantity * item.quantity);
    }
  }

  const opts = session ? { session } : {};
  const decremented = new Map();
  const shortfalls = [];

  try {
    for (const [id, qty] of required) {
      const result = await Ingredient.updateOne(
        { _id: id, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        opts,
      );
      if (result.modifiedCount === 1) {
        decremented.set(id, qty);
      } else {
        const doc = await Ingredient.findById(id).session(session || null);
        shortfalls.push({ ingredient: doc?.name || id, requested: qty, available: doc?.stock ?? 0 });
      }
    }

    if (shortfalls.length) {
      throw ApiError.conflict('Some ingredients sold out while you were checking out', shortfalls);
    }
    return required;
  } catch (err) {
    if (!session) await rollbackDecrements(decremented);
    throw err;
  }
};

const rollbackDecrements = async (decremented) => {
  if (!decremented.size) return;
  await Promise.all(
    [...decremented].map(([id, qty]) =>
      Ingredient.updateOne({ _id: id }, { $inc: { stock: qty } }),
    ),
  ).catch((err) => logger.error(`Stock rollback failed: ${err.message}`));
};

export default { resolveCart, computeTotals, decrementStockForOrder };