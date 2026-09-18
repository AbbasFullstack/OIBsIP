import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middleware/validateMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import * as paymentController from '../controllers/paymentController.js';

const router = Router();

router.post(
  '/verify',
  protect,
  [
    body('razorpay_order_id').trim().notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').trim().notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').trim().notEmpty().withMessage('razorpay_signature is required'),
  ],
  validate,
  paymentController.verifyPayment,
);

// Called by Razorpay, not the browser: authenticated by HMAC signature instead
// of a JWT, so it must stay outside `protect`.
router.post('/webhook', paymentController.razorpayWebhook);

export default router;