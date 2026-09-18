import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import env, { isProd } from './config/env.js';
import './models/User.js';
import './models/Ingredient.js';
import './models/Pizza.js';
import './models/Order.js';

import authRoutes from './routes/authRoutes.js';
import pizzaRoutes from './routes/pizzaRoutes.js';
import ingredientRoutes from './routes/ingredientRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import razorpayService from './services/razorpayService.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);
app.use(cookieParser());

// The webhook needs the untouched body for HMAC verification, so its route is
// mounted with a raw parser before the JSON parser consumes the stream.
app.use('/api/payments/webhook', express.raw({ type: '*/*' }), (req, _res, next) => {
  req.rawBody = req.body;
  try {
    req.body = JSON.parse(req.body.toString('utf8'));
  } catch {
    req.body = {};
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!isProd) app.use(morgan('dev'));

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
  }),
);

app.get('/api/health', (_req, res) =>
  res.json({
    success: true,
    message: 'Pizza Delivery API is running',
    env: env.nodeEnv,
    razorpay: razorpayService.isConfigured() ? 'configured' : 'not configured',
    time: new Date().toISOString(),
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/pizzas', pizzaRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;