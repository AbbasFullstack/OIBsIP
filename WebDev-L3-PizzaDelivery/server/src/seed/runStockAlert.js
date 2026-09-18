// Manual trigger for the low-stock alert job, useful for demos and for testing
// the cron behaviour without waiting for the schedule: `npm run stock:alert`.
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { runStockAlertCheck } from '../jobs/stockAlertJob.js';
import logger from '../utils/logger.js';

const run = async () => {
  await connectDB();
  const result = await runStockAlertCheck({ force: true });
  logger.info(`Manual stock alert check finished: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  logger.error(`Manual stock alert failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});