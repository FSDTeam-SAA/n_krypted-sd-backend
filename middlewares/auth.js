import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import { getAccessTokenSecret } from '../utils/authTokens.js';
import User from '../models/user.model.js';

const getToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.split(' ')[1];
};

export const protect = async (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Authentication token is required');
    }

    const decoded = jwt.verify(token, getAccessTokenSecret());
    if (decoded.type && decoded.type !== 'access') {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid authentication token');
    }

    const user = await User.findOne({
      _id: decoded.id,
      status: { $nin: ['blocked', 'deleted'] }
    });

    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User no longer exists or is not active');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error.name === 'JsonWebTokenError'
      ? new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid authentication token')
      : error);
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) return next();

    const decoded = jwt.verify(token, getAccessTokenSecret());
    if (decoded.type && decoded.type !== 'access') return next();

    req.user = await User.findOne({
      _id: decoded.id,
      status: { $nin: ['blocked', 'deleted'] }
    });

    next();
  } catch {
    next();
  }
};
