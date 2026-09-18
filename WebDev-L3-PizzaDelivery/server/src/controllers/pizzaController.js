import Pizza from '../models/Pizza.js';
import Ingredient from '../models/Ingredient.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const POPULATE = 'base sauce cheese veggies';

const serializePizza = (pizza) => {
  const { basePrice, price } = pizza.computePricing();
  const parts = [pizza.base, pizza.sauce, pizza.cheese, ...pizza.veggies].filter(Boolean);
  // A pizza is orderable only if every ingredient it needs is in stock.
  const inStock = parts.every((p) => p.isAvailable && p.stock > 0);

  return {
    id: pizza._id,
    name: pizza.name,
    description: pizza.description,
    imageUrl: pizza.imageUrl,
    isVeg: pizza.isVeg,
    discountPercent: pizza.discountPercent,
    basePrice,
    price,
    inStock,
    isAvailable: pizza.isAvailable && inStock,
    ingredients: {
      base: pizza.base,
      sauce: pizza.sauce,
      cheese: pizza.cheese,
      veggies: pizza.veggies,
    },
  };
};

export const listPizzas = asyncHandler(async (req, res) => {
  const { veg, search } = req.query;
  const filter = {};

  if (veg === 'true') filter.isVeg = true;
  if (veg === 'false') filter.isVeg = false;
  if (search) filter.name = { $regex: String(search).trim(), $options: 'i' };

  const pizzas = await Pizza.find(filter).populate(POPULATE).sort({ name: 1 });
  return res.json({ success: true, count: pizzas.length, pizzas: pizzas.map(serializePizza) });
});

export const getPizza = asyncHandler(async (req, res) => {
  const pizza = await Pizza.findById(req.params.id).populate(POPULATE);
  if (!pizza) throw ApiError.notFound('Pizza not found');
  return res.json({ success: true, pizza: serializePizza(pizza) });
});

// The custom builder needs the catalog grouped by category with live stock so it
// can disable anything unavailable.
export const listIngredients = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const filter = {};
  if (category) filter.category = category;

  const ingredients = (await Ingredient.find(filter).sort({ category: 1, name: 1 })).map((i) => ({
    id: i._id,
    name: i.name,
    category: i.category,
    price: i.price,
    stock: i.stock,
    isVeg: i.isVeg,
    imageUrl: i.imageUrl,
    inStock: i.isAvailable && i.stock > 0,
  }));

  const grouped = ingredients.reduce((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return res.json({ success: true, grouped, ingredients });
});

export const getIngredient = asyncHandler(async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) throw ApiError.notFound('Ingredient not found');
  return res.json({ success: true, ingredient });
});