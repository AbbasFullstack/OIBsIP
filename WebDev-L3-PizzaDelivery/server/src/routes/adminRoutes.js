import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validate from '../middleware/validateMiddleware.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import * as authController from '../controllers/authController.js';
import * as inventoryController from '../controllers/inventoryController.js';
import * as orderController from '../controllers/orderController.js';
import { INGREDIENT_CATEGORIES, ORDER_STATUSES } from '../config/constants.js';

const router = Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many admin login attempts. Try again later.' },
});

// Separate admin login, reachable without the admin guard below.
router.post(
  '/auth/login',
  adminLoginLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.adminLogin,
);

// Everything past this point requires an authenticated admin. Mounting the
// guards here means no individual admin route can forget the check.
router.use(protect, adminOnly);

const ingredientRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('category').isIn(INGREDIENT_CATEGORIES).withMessage('Invalid category'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be 0 or more'),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
];

// Inventory
router.get('/inventory', inventoryController.getInventory);
router.post('/ingredients', ingredientRules, validate, inventoryController.createIngredient);
router.patch('/ingredients/:id', inventoryController.updateIngredient);
router.patch(
  '/ingredients/:id/stock',
  [body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')],
  validate,
  inventoryController.adjustStock,
);
router.delete('/ingredients/:id', inventoryController.deleteIngredient);

// Orders
router.get('/orders', orderController.listOrders);
router.patch(
  '/orders/:id/status',
  [body('status').isIn(ORDER_STATUSES).withMessage('Invalid order status')],
  validate,
  orderController.updateOrderStatus,
);

export default router;