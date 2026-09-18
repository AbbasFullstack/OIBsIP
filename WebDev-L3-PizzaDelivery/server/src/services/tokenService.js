import crypto from 'node:crypto';

// Generates a single-use token for email links. Only the SHA-256 hash is ever
// persisted; the raw value is returned to the caller exactly once (to be placed
// in the emailed URL). Hashing on every verification keeps comparison constant
// time and makes stored values useless if the database leaks.
export const createToken = (ttlMinutes) => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  return { raw, hash, expiresAt };
};

export const hashToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');

export const isExpired = (expiresAt) => !expiresAt || expiresAt.getTime() < Date.now();