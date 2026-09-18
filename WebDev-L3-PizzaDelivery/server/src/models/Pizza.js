import mongoose from 'mongoose';

// A predefined pizza only references ingredients; its price is derived on read
// so it always tracks the current ingredient prices and stock.
const pizzaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: '' },
    imageUrl: { type: String, default: '' },
    isVeg: { type: Boolean, default: true },
    base: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    sauce: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    cheese: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    veggies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient' }],
    discountPercent: { type: Number, min: 0, max: 90, default: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Sums the referenced ingredient prices, applies any discount, and returns the
// list of required ingredient ids so callers can check stock in one query.
pizzaSchema.methods.computePricing = function computePricing() {
  const parts = [this.base, this.sauce, this.cheese, ...this.veggies].filter(Boolean);
  const basePrice = parts.reduce((sum, ingredient) => sum + (ingredient?.price || 0), 0);
  const price = Math.round(basePrice * (1 - this.discountPercent / 100));
  return {
    basePrice,
    price,
    ingredientIds: parts.map((i) => String(i._id || i)),
  };
};

const Pizza = mongoose.model('Pizza', pizzaSchema);

export default Pizza;