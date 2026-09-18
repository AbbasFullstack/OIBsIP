import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../middleware/authMiddleware.js';
import { createToken, hashToken, isExpired } from '../services/tokenService.js';
import emailService from '../services/emailService.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    // Re-registering an unverified account resends the link rather than
    // dead-ending the user on "email already exists".
    if (!existing.isVerified) {
      const { raw, hash, expiresAt } = createToken(env.verifyTokenTtlMin);
      existing.verificationTokenHash = hash;
      existing.verificationTokenExpiresAt = expiresAt;
      await existing.save({ validateBeforeSave: false });
      await emailService.sendVerification({ to: existing.email, name: existing.name, token: raw });
      return res.status(200).json({
        success: true,
        message: 'Account already exists but is unverified. We sent a fresh verification link.',
      });
    }
    throw ApiError.conflict('An account with that email already exists');
  }

  const { raw, hash, expiresAt } = createToken(env.verifyTokenTtlMin);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    verificationTokenHash: hash,
    verificationTokenExpiresAt: expiresAt,
  });

  try {
    await emailService.sendVerification({ to: user.email, name: user.name, token: raw });
  } catch (err) {
    // The account is still valid; surface a retry path instead of failing hard.
    logger.error(`Verification email failed for ${user.email}: ${err.message}`);
  }

  return res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email to verify your account.',
    user: user.toSafeJSON(),
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    verificationTokenHash: hashToken(token),
  }).select('+verificationTokenHash +verificationTokenExpiresAt');

  if (!user) throw ApiError.badRequest('This verification link is invalid or has already been used');
  if (isExpired(user.verificationTokenExpiresAt)) {
    throw ApiError.badRequest('This verification link has expired. Please request a new one.');
  }

  user.isVerified = true;
  user.verificationTokenHash = undefined;
  user.verificationTokenExpiresAt = undefined;
  await user.save({ validateBeforeSave: false });

  return res.json({
    success: true,
    message: 'Email verified. You can now log in.',
    user: user.toSafeJSON(),
  });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Same response either way so this endpoint cannot enumerate accounts.
  const generic = {
    success: true,
    message: 'If that account exists and is unverified, a new link has been sent.',
  };
  if (!user || user.isVerified) return res.json(generic);

  const { raw, hash, expiresAt } = createToken(env.verifyTokenTtlMin);
  user.verificationTokenHash = hash;
  user.verificationTokenExpiresAt = expiresAt;
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendVerification({ to: user.email, name: user.name, token: raw });
  } catch (err) {
    logger.error(`Resend verification failed for ${user.email}: ${err.message}`);
  }
  return res.json(generic);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  // Identical message for unknown email and wrong password.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isVerified) {
    throw ApiError.forbidden('Please verify your email address before logging in');
  }

  return res.json({
    success: true,
    message: 'Logged in successfully',
    token: signToken(user),
    user: user.toSafeJSON(),
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always 200 to avoid revealing whether an account exists.
  if (user) {
    const { raw, hash, expiresAt } = createToken(env.resetTokenTtlMin);
    user.resetTokenHash = hash;
    user.resetTokenExpiresAt = expiresAt;
    await user.save({ validateBeforeSave: false });
    try {
      await emailService.sendPasswordReset({ to: user.email, name: user.name, token: raw });
    } catch (err) {
      logger.error(`Password reset email failed for ${user.email}: ${err.message}`);
    }
  }

  return res.json({
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({ resetTokenHash: hashToken(token) }).select(
    '+resetTokenHash +resetTokenExpiresAt',
  );
  if (!user) throw ApiError.badRequest('This reset link is invalid or has already been used');
  if (isExpired(user.resetTokenExpiresAt)) {
    throw ApiError.badRequest('This reset link has expired. Please request a new one.');
  }

  user.password = password; // pre-save hook rehashes
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();

  return res.json({ success: true, message: 'Password updated. You can now log in.' });
});

export const me = asyncHandler(async (req, res) =>
  res.json({ success: true, user: req.user.toSafeJSON() }),
);

// Admins share the User collection but authenticate through their own endpoint,
// which additionally refuses any non-admin role.
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.role !== 'admin') {
    throw ApiError.forbidden('This account does not have administrator access');
  }

  return res.json({
    success: true,
    message: 'Admin logged in',
    token: signToken(user),
    user: user.toSafeJSON(),
  });
});