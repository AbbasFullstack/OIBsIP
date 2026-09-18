import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load `server/.env` regardless of the directory the process was started from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

const required = ['MONGO_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // Fail fast: a half-configured server is worse than no server.
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy server/.env.example to server/.env and fill them in.',
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  verifyTokenTtlMin: toInt(process.env.VERIFY_TOKEN_TTL_MIN, 1440),
  resetTokenTtlMin: toInt(process.env.RESET_TOKEN_TTL_MIN, 60),
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'Pizza Delivery <no-reply@pizzadelivery.test>',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
  },
  stockAlertCron: process.env.STOCK_ALERT_CRON || '0 9,21 * * *',
  stockAlertEmail: process.env.STOCK_ALERT_EMAIL || 'admin@pizzadelivery.test',
  admin: {
    name: process.env.ADMIN_NAME || 'Store Admin',
    email: process.env.ADMIN_EMAIL || 'admin@pizzadelivery.test',
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
  },
};

export const isProd = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

export default env;