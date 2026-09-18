import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import env from '../config/env.js';
import User from '../models/User.js';
import Ingredient from '../models/Ingredient.js';
import Pizza from '../models/Pizza.js';
import Order from '../models/Order.js';
import logger from '../utils/logger.js';

// Each ingredient carries its own price and stock — the single source of truth
// shared by the menu, the builder, and stock decrement.
const BASES = [
  { name: 'Classic Hand Tossed', price: 99, stock: 60, lowStockThreshold: 15, isVeg: true },
  { name: 'Thin Crust', price: 119, stock: 45, lowStockThreshold: 12, isVeg: true },
  { name: 'Cheese Burst', price: 159, stock: 35, lowStockThreshold: 10, isVeg: true },
  { name: 'Whole Wheat', price: 129, stock: 40, lowStockThreshold: 10, isVeg: true },
];

const SAUCES = [
  { name: 'Classic Tomato', price: 39, stock: 80, lowStockThreshold: 20, isVeg: true },
  { name: 'Pesto', price: 59, stock: 30, lowStockThreshold: 10, isVeg: true },
  { name: 'BBQ', price: 49, stock: 45, lowStockThreshold: 12, isVeg: true },
  { name: 'Peri-Peri', price: 49, stock: 50, lowStockThreshold: 12, isVeg: true },
  { name: 'Garlic Alfredo', price: 69, stock: 28, lowStockThreshold: 10, isVeg: true },
];

const CHEESES = [
  { name: 'Mozzarella', price: 79, stock: 55, lowStockThreshold: 15, isVeg: true },
  { name: 'Cheddar', price: 89, stock: 30, lowStockThreshold: 10, isVeg: true },
  { name: 'Vegan Cashew', price: 109, stock: 18, lowStockThreshold: 8, isVeg: true },
];

const VEGGIES = [
  { name: 'Onion', price: 25, stock: 90, lowStockThreshold: 20, isVeg: true },
  { name: 'Capsicum', price: 30, stock: 70, lowStockThreshold: 20, isVeg: true },
  { name: 'Mushroom', price: 45, stock: 40, lowStockThreshold: 15, isVeg: true },
  { name: 'Black Olives', price: 55, stock: 35, lowStockThreshold: 12, isVeg: true },
  { name: 'Sweet Corn', price: 35, stock: 55, lowStockThreshold: 15, isVeg: true },
  { name: 'Paneer', price: 65, stock: 32, lowStockThreshold: 10, isVeg: true },
  { name: 'Jalapeno', price: 40, stock: 26, lowStockThreshold: 10, isVeg: true },
  { name: 'Pepperoni', price: 95, stock: 22, lowStockThreshold: 8, isVeg: false },
];

const PIZZA_RECIPES = [
  {
    name: 'Margherita Classic',
    description: 'The timeless trio — tomato sauce, mozzarella, and a hand-tossed base.',
    isVeg: true,
    base: 'Classic Hand Tossed',
    sauce: 'Classic Tomato',
    cheese: 'Mozzarella',
    veggies: [],
  },
  {
    name: 'Garden Veggie Supreme',
    description: 'Loaded with onion, capsicum, sweet corn, and olives.',
    isVeg: true,
    base: 'Thin Crust',
    sauce: 'Classic Tomato',
    cheese: 'Mozzarella',
    veggies: ['Onion', 'Capsicum', 'Sweet Corn', 'Black Olives'],
  },
  {
    name: 'Paneer Tikka Treat',
    description: 'Marinated paneer, onion, and capsicum over a smoky BBQ base.',
    isVeg: true,
    base: 'Cheese Burst',
    sauce: 'BBQ',
    cheese: 'Cheddar',
    veggies: ['Paneer', 'Onion', 'Capsicum'],
  },
  {
    name: 'Pepperoni Blaze',
    description: 'Spicy pepperoni and jalapeño on a punched-up peri-peri base.',
    isVeg: false,
    base: 'Classic Hand Tossed',
    sauce: 'Peri-Peri',
    cheese: 'Mozzarella',
    veggies: ['Pepperoni', 'Jalapeno'],
  },
  {
    name: 'Mushroom Pesto Delight',
    description: 'Earthy mushrooms and olives with a basil pesto finish.',
    isVeg: true,
    base: 'Whole Wheat',
    sauce: 'Pesto',
    cheese: 'Mozzarella',
    veggies: ['Mushroom', 'Black Olives'],
  },
  {
    name: 'Vegan Cashew Crunch',
    description: 'Dairy-free cashew cheese, sweet corn, jalapeño, and capsicum.',
    isVeg: true,
    base: 'Whole Wheat',
    sauce: 'Garlic Alfredo',
    cheese: 'Vegan Cashew',
    veggies: ['Sweet Corn', 'Jalapeno', 'Capsicum'],
  },
];

const upsertIngredients = async () => {
  const groups = [
    ['base', BASES],
    ['sauce', SAUCES],
    ['cheese', CHEESES],
    ['veggie', VEGGIES],
  ];

  const byName = new Map();
  for (const [category, list] of groups) {
    for (const item of list) {
      // `stock` is seeded on insert only, so re-running the seed never resets
      // stock that the running app has already decremented through sales.
      const { stock, ...rest } = item;
      const doc = await Ingredient.findOneAndUpdate(
        { name: item.name, category },
        { $set: { ...rest, category, isAvailable: true }, $setOnInsert: { stock } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      byName.set(item.name, doc);
    }
  }
  return byName;
};

const upsertPizzas = async (byName) => {
  let created = 0;
  for (const recipe of PIZZA_RECIPES) {
    const doc = {
      name: recipe.name,
      description: recipe.description,
      isVeg: recipe.isVeg,
      base: byName.get(recipe.base)._id,
      sauce: byName.get(recipe.sauce)._id,
      cheese: byName.get(recipe.cheese)._id,
      veggies: recipe.veggies.map((v) => byName.get(v)._id),
      isAvailable: true,
    };
    await Pizza.findOneAndUpdate({ name: recipe.name }, { $set: doc }, { upsert: true });
    created += 1;
  }
  return created;
};

const upsertAdmin = async () => {
  const email = env.admin.email.toLowerCase();
  let admin = await User.findOne({ email }).select('+password');
  if (admin) {
    admin.name = env.admin.name;
    admin.role = 'admin';
    admin.isVerified = true;
    admin.password = env.admin.password; // pre-save hook rehashes
    await admin.save();
    return { admin, existed: true };
  }
  admin = await User.create({
    name: env.admin.name,
    email,
    password: env.admin.password,
    role: 'admin',
    isVerified: true,
  });
  return { admin, existed: false };
};

const run = async () => {
  await connectDB();

  // Destructive only when explicitly asked; otherwise the script is idempotent
  // so it can be re-run against a live development database.
  if (process.argv.includes('--fresh')) {
    await Promise.all([Order.deleteMany({}), Pizza.deleteMany({}), Ingredient.deleteMany({})]);
    logger.warn('Existing orders, pizzas, and ingredients cleared (--fresh)');
  }

  const byName = await upsertIngredients();
  const pizzaCount = await upsertPizzas(byName);
  const { admin, existed } = await upsertAdmin();

  const totals = await Ingredient.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 }, stock: { $sum: '$stock' } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('\n🌱 Seed complete\n');
  for (const row of totals) {
    console.log(`   ${row._id.padEnd(8)} ${String(row.count).padStart(2)} items, ${row.stock} units in stock`);
  }
  console.log(`   pizzas   ${pizzaCount} predefined menu items`);
  console.log('\n🔐 Admin credentials');
  console.log(`   email:    ${admin.email}`);
  console.log(`   password: ${env.admin.password}`);
  console.log(`   (${existed ? 'updated existing admin' : 'created new admin'})\n`);
  console.log('👉 Start the app with: npm run dev\n');

  await mongoose.disconnect();
};

run().catch(async (err) => {
  logger.error(`Seed failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});