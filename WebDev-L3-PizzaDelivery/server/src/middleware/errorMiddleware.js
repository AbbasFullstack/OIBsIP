import ApiError from '../utils/ApiError.js';
import { isProd } from '../config/env.js';
import logger from '../utils/logger.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// Translates framework-level errors into the single { message, details } shape
// the client expects, and only leaks stack traces outside production.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    details = Object.values(err.errors).map((e) => e.message);
    message = 'Validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account or item with that ${field} already exists`;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session is invalid or has expired';
  } else if (statusCode >= 500) {
    logger.error(err.stack || err.message);
  }

  const body = { success: false, message };
  if (details) body.details = details;
  if (!isProd && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
};

export default errorHandler;