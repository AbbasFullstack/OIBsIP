import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validate from '../middleware/validateMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// Auth endpoints are the most attractive to brute force, so they get a tighter
// limiter than the global one.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

const passwordRules = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/\d/)
  .withMessage('Password must contain a number');

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    passwordRules,
  ],
  validate,
  authController.register,
);

router.post(
  '/verify-email',
  [body('token').trim().notEmpty().withMessage('Verification token is required')],
  validate,
  authController.verifyEmail,
);

router.post(
  '/resend-verification',
  authLimiter,
  [body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail()],
  validate,
  authController.resendVerification,
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login,
);

router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail()],
  validate,
  authController.forgotPassword,
);

router.post(
  '/reset-password/:token',
  authLimiter,
  [param('token').notEmpty(), passwordRules],
  validate,
  authController.resetPassword,
);

router.get('/me', protect, authController.me);

export default router;