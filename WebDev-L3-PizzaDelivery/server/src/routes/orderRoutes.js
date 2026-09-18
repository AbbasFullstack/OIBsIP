import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middleware/validateMiddleware.js';
import { protect, verifiedOnly } from '../middleware/authMiddleware.js';
import * as orderController from '../controllers/orderController.js';

const router = Router();

const orderRules = [
  body('items').isArray({ min: 1 }).withMessage('Your cart is empty'),
  body('items.*.kind').isIn(['menu', 'custom']).withMessage('Invalid cart item type'),
  body('items.*.quantity').isInt({ min: 1, max: 20 }).withMessage('Quantity must be 1–20'),
  body('deliveryAddress.line1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('deliveryAddress.city').trim().notEmpty().withMessage('City is required'),
  body('deliveryAddress.postalCode').trim().notEmpty().withMessage('Postal code is required'),
  body('deliveryAddress.phone').trim().notEmpty().withMessage('Phone number is required'),
];

router.use(protect);

router.post('/', verifiedOnly, orderRules, validate, orderController.createOrder);
router.get('/mine', orderController.getMyOrders);
router.get('/:id', orderController.getOrder);

export default router;