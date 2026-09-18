import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  // Fallback cookie keeps server-rendered/admin tooling able to authenticate.
  if (req.cookies?.token) return req.cookies.token;
  return null;
};

// Verifies the JWT and loads the current user so downstream handlers can trust
// `req.user` (including role) rather than re-decoding the token themselves.
export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Session is invalid or has expired');
  }

  const user = await User.findById(payload.id);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  req.user = user;
  next();
});

export const adminOnly = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Administrator access required'));
  }
  return next();
};

// Used after `protect` on customer routes whose actions assume a verified
// account exists.
export const verifiedOnly = (req, _res, next) => {
  if (!req.user?.isVerified) {
    return next(ApiError.forbidden('Please verify your email address first'));
  }
  return next();
};