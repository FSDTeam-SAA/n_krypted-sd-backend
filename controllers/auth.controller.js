import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { deleteAccountCascade } from '../utils/accountDeletion.js';
import {
  createAuthTokens,
  generateOtp,
  generateResetToken,
  getRefreshTokenSecret,
  hashValue,
  parseDurationMs
} from '../utils/authTokens.js';
import { streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import { sendOtpEmail } from '../utils/email.js';
import User from '../models/user.model.js';
import Restaurant from '../models/restaurant.model.js';

const otpExpiryDate = () => {
  const minutes = Number(process.env.OTP_EXPIRES_IN_MINUTES) || 10;
  return new Date(Date.now() + minutes * 60 * 1000);
};

const resetTokenExpiryDate = () => {
  const minutes = Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES) || 15;
  return new Date(Date.now() + minutes * 60 * 1000);
};

const buildOtpResponse = (expiresAt, emailResult) => ({
  expiresAt,
  emailSent: emailResult.sent,
  emailSkipped: emailResult.skipped,
  ...(emailResult.devOtp && { devOtp: emailResult.devOtp })
});

const issueOtp = async (user, purpose) => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 12);
  const expiresAt = otpExpiryDate();

  if (purpose === 'password_reset') {
    user.passwordResetOtpHash = otpHash;
    user.passwordResetOtpExpiresAt = expiresAt;
    user.passwordResetTokenHash = undefined;
    user.passwordResetTokenExpiresAt = undefined;
  } else {
    user.emailVerificationOtpHash = otpHash;
    user.emailVerificationOtpExpiresAt = expiresAt;
  }

  await user.save();

  try {
    const emailResult = await sendOtpEmail({ to: user.email, otp, purpose });
    return buildOtpResponse(expiresAt, emailResult);
  } catch {
    throw new ApiError(StatusCodes.BAD_GATEWAY, 'Failed to send OTP email');
  }
};

const getUserForOtp = async (email) => {
  return User.findOne({ email, status: { $ne: 'deleted' } }).select(
    '+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetTokenHash +passwordResetTokenExpiresAt +refreshTokenHash +refreshTokenExpiresAt'
  );
};

const verifyOtpValue = async (otp, hash, expiresAt) => {
  if (!hash || !expiresAt || expiresAt.getTime() < Date.now()) {
    return false;
  }

  return bcrypt.compare(otp, hash);
};

const authPayload = async (user, message, statusCode = StatusCodes.OK, restaurant = undefined) => {
  const tokens = await createAuthTokens(user);

  return {
    message,
    statusCode,
    data: {
      ...tokens,
      user,
      ...(restaurant && { restaurant })
    }
  };
};

export const register = catchAsync(async (req, res) => {
  const { name, email, password, role = 'customer', phone, restaurant: restaurantInput } = req.body;
  const normalizedEmail = email.toLowerCase();
  let user = await User.findOne({ email: normalizedEmail }).select(
    '+passwordHash +emailVerificationOtpHash +emailVerificationOtpExpiresAt'
  );

  if (user) {
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (user.status === 'deleted' || user.emailVerified || user.role !== role || !passwordMatches) {
      throw new ApiError(StatusCodes.CONFLICT, 'An account with this email already exists');
    }

    user.name = name;
    user.phone = phone;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationOtpHash = undefined;
    user.emailVerificationOtpExpiresAt = undefined;
    await user.save();
  } else if (role === 'admin') {
    const adminExists = await User.exists({ role: 'admin', status: { $ne: 'deleted' } });
    if (adminExists) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Admin registration is only available for the first admin account');
    }
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      phone,
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
  }

  let restaurant = role === 'restaurant_owner'
    ? await Restaurant.findOne({ owner: user._id, status: { $ne: 'deleted' } })
    : undefined;
  if (role === 'restaurant_owner' && restaurantInput) {
    restaurant ??= await Restaurant.create({
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

  if (!user.emailVerified) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Please verify your email before logging in');
  }

  const restaurant = user.role === 'restaurant_owner'
    ? await Restaurant.findOne({ owner: user._id, status: { $ne: 'deleted' } })
    : undefined;

  const payload = await authPayload(user, 'Login successful', StatusCodes.OK, restaurant);
  sendSuccess(res, payload.statusCode, payload.message, payload.data);
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Refresh token is required');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getRefreshTokenSecret());
  } catch {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
  }

  if (decoded.type !== 'refresh') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
  }

  const user = await User.findOne({
    _id: decoded.id,
    status: { $nin: ['blocked', 'deleted'] }
  }).select('+refreshTokenHash +refreshTokenExpiresAt');

  const tokenMatches = user?.refreshTokenHash === hashValue(token);
  const tokenActive = user?.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() > Date.now();

  if (!user || !tokenMatches || !tokenActive) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
  }

  const tokens = await createAuthTokens(user);

  sendSuccess(res, StatusCodes.OK, 'Token refreshed successfully', {
    ...tokens,
    user
  });
});

export const forgotPassword = catchAsync(async (req, res) => {
  const user = await getUserForOtp(req.body.email);

  if (!user || ['blocked', 'deleted'].includes(user.status)) {
    sendSuccess(res, StatusCodes.OK, 'Password reset OTP sent successfully', {
      otp: { emailSent: false }
    });
    return;
  }

  const otp = await issueOtp(user, 'password_reset');

  sendSuccess(res, StatusCodes.OK, 'Password reset OTP sent successfully', { otp });
});

export const verifyPasswordResetOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const user = await getUserForOtp(email);

  if (!user || !(await verifyOtpValue(otp, user.passwordResetOtpHash, user.passwordResetOtpExpiresAt))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired OTP');
  }

  const resetToken = generateResetToken();
  user.passwordResetTokenHash = hashValue(resetToken);
  user.passwordResetTokenExpiresAt = resetTokenExpiryDate();
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  await user.save();

  sendSuccess(res, StatusCodes.OK, 'Password reset OTP verified successfully', {
    resetToken,
    expiresAt: user.passwordResetTokenExpiresAt
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { email, resetToken, newPassword } = req.body;

  if (!resetToken) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Password reset token is required');
  }

  const user = await getUserForOtp(email);
  const tokenMatches = user?.passwordResetTokenHash === hashValue(resetToken);
  const tokenActive = user?.passwordResetTokenExpiresAt && user.passwordResetTokenExpiresAt.getTime() > Date.now();

  if (!user || !tokenMatches || !tokenActive) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired password reset token');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetTokenExpiresAt = undefined;
  user.refreshTokenHash = undefined;
  user.refreshTokenExpiresAt = undefined;
  await user.save();

  sendSuccess(res, StatusCodes.OK, 'Password reset successfully');
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
  user.refreshTokenHash = undefined;
  user.refreshTokenExpiresAt = undefined;
  await user.save();

  sendSuccess(res, StatusCodes.OK, 'Password changed successfully');
});

export const logout = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $unset: {
      refreshTokenHash: '',
      refreshTokenExpiresAt: ''
    }
  });

  sendSuccess(res, StatusCodes.OK, 'Logged out successfully');
});

export const deleteMe = catchAsync(async (req, res) => {
  await deleteAccountCascade(req.user._id);
  sendSuccess(res, StatusCodes.OK, 'Account deleted successfully');
});
