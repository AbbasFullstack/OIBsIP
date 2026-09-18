import mongoose from 'mongoose';
import { INGREDIENT_CATEGORIES } from '../config/constants.js';

// One collection backs bases, sauces, cheeses, and veggies. Price and stock
// live here only, so the menu, the builder, and stock math cannot disagree.
const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: INGREDIENT_CATEGORIES, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 10 },
    isAvailable: { type: Boolean, default: true },
    isVeg: { type: Boolean, default: true },
    imageUrl: { type: String, default: '' },
  },
  { timestamps: true },
);

// A base "Thin Crust" and a sauce "Thin Crust" are distinct items.
ingredientSchema.index({ name: 1, category: 1 }, { unique: true });

ingredientSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

ingredientSchema.virtual('isLowStock').get(function isLowStock() {
  return this.stock > 0 && this.stock < this.lowStockThreshold;
});

ingredientSchema.set('toJSON', { virtuals: true });

const Ingredient = mongoose.model('Ingredient', ingredientSchema);

export { ingredientSchema };
export default Ingredient;