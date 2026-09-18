import http from 'node:http';
import app from './app.js';
import env from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './config/socket.js';
import { startStockAlertJob } from './jobs/stockAlertJob.js';
import { verifyEmailTransport } from './services/emailService.js';
import razorpayService from './services/razorpayService.js';
import logger from './utils/logger.js';

const start = async () => {
  // Surface configuration gaps immediately rather than failing on first use.
  if (!razorpayService.isConfigured()) {
    logger.warn('Razorpay keys are missing — checkout will return 503 until configured.');
  }

  await connectDB();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  // Cron only starts once Mongo is reachable; otherwise the first run queries
  // an unmounted connection.
  startStockAlertJob();

  // Warm the email transporter in the background so the first signup is fast.
  verifyEmailTransport().catch((err) => logger.warn(`Email transport warmup: ${err.message}`));

  httpServer.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    logger.info(`CORS client origin: ${env.clientUrl}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });
};

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});