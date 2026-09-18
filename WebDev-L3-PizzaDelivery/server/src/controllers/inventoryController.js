import Ingredient from '../models/Ingredient.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { emitToAdmin } from '../config/socket.js';

const withFlags = (i) => ({
  id: i._id,
  name: i.name,
  category: i.category,
  price: i.price,
  stock: i.stock,
  lowStockThreshold: i.lowStockThreshold,
  isAvailable: i.isAvailable,
  isVeg: i.isVeg,
  imageUrl: i.imageUrl,
  isLowStock: i.stock > 0 && i.stock < i.lowStockThreshold,
  isOutOfStock: i.stock <= 0,
});

// Admin inventory dashboard: everything in one payload plus summary counters so
// the header strip does not need a second request.
export const getInventory = asyncHandler(async (_req, res) => {
  const ingredients = (await Ingredient.find().sort({ category: 1, name: 1 })).map(withFlags);

  const summary = {
    total: ingredients.length,
    lowStock: ingredients.filter((i) => i.isLowStock).length,
    outOfStock: ingredients.filter((i) => i.isOutOfStock).length,
    stockValue: ingredients.reduce((sum, i) => sum + i.price * i.stock, 0),
  };

  return res.json({ success: true, summary, ingredients });
});

export const createIngredient = asyncHandler(async (req, res) => {
  const ingredient = await Ingredient.create(req.body);
  emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'created', ingredient: withFlags(ingredient) });
  return res.status(201).json({ success: true, ingredient: withFlags(ingredient) });
});

export const updateIngredient = asyncHandler(async (req, res) => {
  // `stock` has its own dedicated endpoint; block it here so this route stays
  // about catalog metadata and cannot be used to silently bypass stock guards.
  const { stock, ...updates } = req.body;
  const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!ingredient) throw ApiError.notFound('Ingredient not found');

  emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'updated', ingredient: withFlags(ingredient) });
  return res.json({ success: true, ingredient: withFlags(ingredient) });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const { stock } = req.body;
  const ingredient = await Ingredient.findByIdAndUpdate(
    req.params.id,
    { stock },
    { new: true, runValidators: true },
  );
  if (!ingredient) throw ApiError.notFound('Ingredient not found');

  const payload = withFlags(ingredient);
  emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'stock', ingredient: payload });
  if (payload.isLowStock || payload.isOutOfStock) {
    emitToAdmin(SOCKET_EVENTS.INVENTORY_LOW_STOCK, { ingredients: [payload] });
  }
  return res.json({ success: true, ingredient: payload });
});

// Soft delete when the ingredient is referenced by an order (so history stays
// intact); hard delete otherwise.
export const deleteIngredient = asyncHandler(async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) throw ApiError.notFound('Ingredient not found');

  const referenced = await Order.exists({ 'items.stockUsage.ingredient': ingredient._id });
  if (referenced) {
    ingredient.isAvailable = false;
    await ingredient.save();
    emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'disabled', ingredient: withFlags(ingredient) });
    return res.json({
      success: true,
      message: 'Ingredient is used by existing orders, so it was marked unavailable instead of deleted.',
    });
  }

  await ingredient.deleteOne();
  emitToAdmin(SOCKET_EVENTS.INVENTORY_UPDATED, { action: 'deleted', ingredientId: ingredient._id });
  return res.json({ success: true, message: 'Ingredient deleted' });
});