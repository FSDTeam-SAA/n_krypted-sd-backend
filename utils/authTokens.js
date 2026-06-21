import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

export const hashValue = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

export const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const parseDurationMs = (value, fallbackMs) => {
  if (!value) return fallbackMs;
  if (typeof value === 'number') return value;

  const match = String(value).trim().match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};

export const getAccessTokenSecret = () => process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;

export const getRefreshTokenSecret = () => {
  return process.env.REFRESH_TOKEN_SECRET || `${process.env.JWT_SECRET || 'dev-secret'}-refresh`;
};

export const signAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, type: 'access' },
    getAccessTokenSecret(),
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m' }
  );
};

export const signRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, type: 'refresh' },
    getRefreshTokenSecret(),
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d' }
  );
};

export const createAuthTokens = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const refreshMs = parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN || '30d', 30 * 24 * 60 * 60 * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshMs);

  await User.findByIdAndUpdate(user._id, {
    refreshTokenHash: hashValue(refreshToken),
    refreshTokenExpiresAt
  });

  return {
    accessToken,
    refreshToken,
    token: accessToken,
    refreshTokenExpiresAt
  };
};
