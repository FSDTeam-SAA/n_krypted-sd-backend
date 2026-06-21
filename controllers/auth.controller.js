import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { deleteAccountCascade } from '../utils/accountDeletion.js';
import { streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import User from '../models/user.model.js';
import Restaurant from '../models/restaurant.model.js';

const signToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const authPayload = async (user, message, statusCode = StatusCodes.OK, restaurant = undefined) => ({
  message,
  statusCode,
  data: {
    token: signToken(user),
    user,
    ...(restaurant && { restaurant })
  }
});

export const register = catchAsync(async (req, res) => {
  const { name, email, password, role = 'customer', phone, restaurant: restaurantInput } = req.body;

  if (role === 'admin') {
    const adminExists = await User.exists({ role: 'admin', status: { $ne: 'deleted' } });
    if (adminExists) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Admin registration is only available for the first admin account');
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash, role, phone });

  let restaurant;
  if (role === 'restaurant_owner' && restaurantInput) {
    restaurant = await Restaurant.create({
      ...restaurantInput,
      owner: user._id,
      status: 'pending'
    });
  }

  const payload = await authPayload(user, 'Registration successful', StatusCodes.CREATED, restaurant);
  sendSuccess(res, payload.statusCode, payload.message, payload.data);
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid email or password');
  }

  if (['blocked', 'deleted'].includes(user.status)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'This account is not active');
  }

  const restaurant = user.role === 'restaurant_owner'
    ? await Restaurant.findOne({ owner: user._id, status: { $ne: 'deleted' } })
    : undefined;

  const payload = await authPayload(user, 'Login successful', StatusCodes.OK, restaurant);
  sendSuccess(res, payload.statusCode, payload.message, payload.data);
});

export const getMe = catchAsync(async (req, res) => {
  const restaurant = req.user.role === 'restaurant_owner'
    ? await Restaurant.findOne({ owner: req.user._id, status: { $ne: 'deleted' } })
    : undefined;

  sendSuccess(res, StatusCodes.OK, 'Profile fetched successfully', {
    user: req.user,
    ...(restaurant && { restaurant })
  });
});

export const updateMe = catchAsync(async (req, res) => {
  const allowedFields = ['name', 'phone', 'avatar'];
  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (req.file) {
    updates.avatar = toImageAsset(await streamUpload(req.file.buffer, `users/${req.user._id}`));
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  });

  sendSuccess(res, StatusCodes.OK, 'Profile updated successfully', { user });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  sendSuccess(res, StatusCodes.OK, 'Password changed successfully');
});

export const deleteMe = catchAsync(async (req, res) => {
  await deleteAccountCascade(req.user._id);
  sendSuccess(res, StatusCodes.OK, 'Account deleted successfully');
});
