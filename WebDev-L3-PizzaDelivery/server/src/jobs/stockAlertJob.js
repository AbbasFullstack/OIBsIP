import cron from 'node-cron';
import Ingredient from '../models/Ingredient.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { emitToAdmin } from '../config/socket.js';
import emailService from '../services/emailService.js';

// Signature of the last set we alerted on. Prevents re-mailing the same
// low-stock list every run while still alerting when the set changes.
let lastAlertedSignature = null;

const buildSignature = (ingredients) =>
  ingredients
    .map((i) => `${i._id}:${i.stock}`)
    .sort()
    .join('|');

export const runStockAlertCheck = async ({ force = false } = {}) => {
  const low = await Ingredient.find({
    isAvailable: true,
    $expr: { $lt: ['$stock', '$lowStockThreshold'] },
  }).sort({ stock: 1 });

  if (low.length === 0) {
    lastAlertedSignature = null;
    logger.info('Stock alert check: all ingredients are above their thresholds');
    return { alerted: false, count: 0 };
  }

  const payload = low.map((i) => ({
    id: i._id,
    name: i.name,
    category: i.category,
    stock: i.stock,
    lowStockThreshold: i.lowStockThreshold,
  }));

  // Push to the admin console regardless, so the dashboard reflects reality.
  emitToAdmin(SOCKET_EVENTS.INVENTORY_LOW_STOCK, { ingredients: payload });

  const signature = buildSignature(low);
  if (!force && signature === lastAlertedSignature) {
    logger.info(`Stock alert check: ${low.length} low item(s), already alerted — skipping email`);
    return { alerted: false, count: low.length, skipped: true };
  }

  lastAlertedSignature = signature;

  try {
    await emailService.sendLowStockAlert({ to: env.stockAlertEmail, ingredients: payload });
    logger.warn(`Stock alert sent for ${low.length} low-stock ingredient(s)`);
  } catch (err) {
    logger.error(`Stock alert email failed: ${err.message}`);
  }

  return { alerted: true, count: low.length };
};

let task = null;

export const startStockAlertJob = () => {
  if (!cron.validate(env.stockAlertCron)) {
    logger.error(`Invalid STOCK_ALERT_CRON expression "${env.stockAlertCron}" — job not started`);
    return null;
  }

  task = cron.schedule(env.stockAlertCron, () => {
    runStockAlertCheck().catch((err) => logger.error(`Stock alert job error: ${err.message}`));
  });

  logger.info(`Low-stock alert job scheduled (${env.stockAlertCron})`);
  return task;
};

export const stopStockAlertJob = () => {
  task?.stop();
  task = null;
};

export default { startStockAlertJob, stopStockAlertJob, runStockAlertCheck };