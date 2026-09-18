import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

// Multi-document transactions need a replica set. Set once at connect time so
// callers can branch on it instead of discovering the limitation at runtime.
export let supportsTransactions = false;

const detectReplicaSet = async () => {
  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    supportsTransactions = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    supportsTransactions = false;
  }
  return supportsTransactions;
};

// Connect once and let Mongoose manage the pool for the process lifetime.
export const connectDB = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected → ${mongoose.connection.name}`);

  await detectReplicaSet();
  logger.info(
    supportsTransactions
      ? 'MongoDB replica set detected — payments use multi-document transactions'
      : 'MongoDB is a standalone server — payments fall back to guarded conditional updates',
  );

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));

  return mongoose.connection;
};

export const disconnectDB = async () => {
  await mongoose.connection.close();
};

export default connectDB;