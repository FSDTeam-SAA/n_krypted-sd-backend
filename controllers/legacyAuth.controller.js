import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { createAuthTokens, generateOtp, generateResetToken, hashValue } from '../utils/authTokens.js';
import { streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import { sendOtpEmail } from '../utils/email.js';
import { sendLegacy } from '../utils/legacyApi.js';
import { legacyMeta, legacyUser } from '../utils/legacySerializers.js';
import { getPagination } from '../utils/pagination.js';
import { deleteAccountCascade } from '../utils/accountDeletion.js';
import User from '../models/user.model.js';
import CheckIn from '../models/checkIn.model.js';
import Review from '../models/review.model.js';

const otpExpiry = () => new Date(Date.now() + (Number(process.env.OTP_EXPIRES_IN_MINUTES) || 10) * 60000);

const selectSecrets = () => [
  '+passwordHash',
  '+emailVerificationOtpHash',
  '+emailVerificationOtpExpiresAt',
  '+passwordResetOtpHash',
  '+passwordResetOtpExpiresAt',
  '+passwordResetTokenHash',
  '+passwordResetTokenExpiresAt'
].join(' ');

const setOtp = async (user, purpose) => {
  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 12);
  const expiresAt = otpExpiry();
  if (purpose === 'reset') {
    user.passwordResetOtpHash = hash;
    user.passwordResetOtpExpiresAt = expiresAt;
  } else {
    user.emailVerificationOtpHash = hash;
    user.emailVerificationOtpExpiresAt = expiresAt;
  }
  await user.save();
  const email = await sendOtpEmail({
    to: user.email,
    otp,
    purpose: purpose === 'reset' ? 'password_reset' : 'email_verification'
  });
  return { expiresAt, emailSent: email.sent, emailSkipped: email.skipped, ...(email.devOtp && { devOtp: email.devOtp }) };
};

const validOtp = async (code, hash, expiresAt) => {
  return Boolean(hash && expiresAt && expiresAt.getTime() > Date.now() && await bcrypt.compare(code, hash));
};

export const legacyRegister = catchAsync(async (req, res) => {
  const role = req.body.role === 'restaurant_owner' ? 'restaurant_owner' : req.body.role === 'admin' ? 'admin' : 'customer';
  const email = req.body.email.toLowerCase();
  const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
  const autoVerify = !requireEmailVerification || role === 'restaurant_owner' || role === 'admin';
  let user = await User.findOne({ email, status: { $ne: 'deleted' } }).select('+passwordHash');

  // A blocked SMTP request may have created an unverified account before the
  // mobile client timed out. When verification is disabled, let the same
  // signup complete that account instead of trapping the user in a conflict.
  if (user) {
    if (!autoVerify || user.emailVerified || user.role !== role) {
      throw new ApiError(StatusCodes.CONFLICT, 'An account with this email already exists');
    }
    user.name = req.body.name;
    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.phone = req.body.phoneNumber;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationOtpHash = undefined;
    user.emailVerificationOtpExpiresAt = undefined;
    await user.save();
  } else {
    user = await User.create({
      name: req.body.name,
      email,
      passwordHash: await bcrypt.hash(req.body.password, 12),
      phone: req.body.phoneNumber,
      role,
      emailVerified: autoVerify,
      ...(autoVerify && { emailVerifiedAt: new Date() })
    });
  }

  let token;
  let otp;
  if (autoVerify) {
    ({ token } = await createAuthTokens(user));
  } else {
    otp = await setOtp(user, 'verify');
  }
  sendLegacy(res, { data: legacyUser(user), token, otp }, StatusCodes.CREATED, 'Registration successful');
});

export const legacyLogin = catchAsync(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid email or password');
  }
  if (['blocked', 'deleted'].includes(user.status)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'This account is not active');
  }
  if (!user.emailVerified) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Please verify your email before logging in');
  }
  const tokens = await createAuthTokens(user);
  sendLegacy(res, { data: legacyUser(user), token: tokens.token, refreshToken: tokens.refreshToken }, StatusCodes.OK, 'Login successful');
});

export const legacyForgotPassword = catchAsync(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase(), status: { $nin: ['blocked', 'deleted'] } }).select(selectSecrets());
  const otp = user ? await setOtp(user, 'reset') : { emailSent: false };
  sendLegacy(res, { otp }, StatusCodes.OK, 'Password reset OTP sent');
});

export const legacyVerify = catchAsync(async (req, res) => {
  const code = req.body.code || req.body.otp;
  const user = await User.findOne({ email: req.body.email.toLowerCase(), status: { $nin: ['blocked', 'deleted'] } }).select(selectSecrets());
  if (!user) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired verification code');

  if (!user.emailVerified) {
    if (!(await validOtp(code, user.emailVerificationOtpHash, user.emailVerificationOtpExpiresAt))) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired verification code');
    }
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationOtpHash = undefined;
    user.emailVerificationOtpExpiresAt = undefined;
    await user.save();
    const tokens = await createAuthTokens(user);
    sendLegacy(res, { data: legacyUser(user), token: tokens.token, refreshToken: tokens.refreshToken }, StatusCodes.OK, 'Email verified');
    return;
  }

  if (!(await validOtp(code, user.passwordResetOtpHash, user.passwordResetOtpExpiresAt))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired verification code');
  }
  const resetToken = generateResetToken();
  user.passwordResetTokenHash = hashValue(resetToken);
  user.passwordResetTokenExpiresAt = new Date(Date.now() + 15 * 60000);
  await user.save();
  sendLegacy(res, { data: legacyUser(user), token: resetToken, resetToken }, StatusCodes.OK, 'Password reset code verified');
});

export const legacyResetPassword = catchAsync(async (req, res) => {
  const token = req.body.token || req.body.resetToken;
  const password = req.body.password || req.body.newPassword;
  const user = await User.findOne({ email: req.body.email.toLowerCase(), status: { $nin: ['blocked', 'deleted'] } }).select(selectSecrets());
  const resetTokenValid = Boolean(
    user?.passwordResetTokenHash &&
    user.passwordResetTokenExpiresAt?.getTime() > Date.now() &&
    user.passwordResetTokenHash === hashValue(token || '')
  );
  const otpValid = user ? await validOtp(token, user.passwordResetOtpHash, user.passwordResetOtpExpiresAt) : false;
  if (!user || (!resetTokenValid && !otpValid)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid or expired password reset token');
  }
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  user.passwordResetTokenHash = undefined;
  user.passwordResetTokenExpiresAt = undefined;
  user.refreshTokenHash = undefined;
  user.refreshTokenExpiresAt = undefined;
  await user.save();
  sendLegacy(res, {}, StatusCodes.OK, 'Password reset successfully');
});

export const legacyChangePassword = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  sendLegacy(res, {}, StatusCodes.OK, 'Password changed successfully');
});

export const legacyUpdateProfile = catchAsync(async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.phoneNumber !== undefined) updates.phone = req.body.phoneNumber;
  if (req.body.country !== undefined) updates.country = req.body.country;
  if (req.body.cityState !== undefined) updates.cityState = req.body.cityState;
  if (req.body.avatar && typeof req.body.avatar === 'string') {
    updates.avatar = { public_id: `external/avatar-${req.user._id}`, secure_url: req.body.avatar };
  }
  if (req.file) updates.avatar = toImageAsset(await streamUpload(req.file.buffer, `users/${req.user._id}`));
  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  sendLegacy(res, { data: legacyUser(user) }, StatusCodes.OK, 'Profile updated successfully');
});

export const legacyGetUser = catchAsync(async (req, res) => {
  if (req.user.role !== 'admin' && String(req.user._id) !== req.params.id) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot view this user');
  }
  const user = await User.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  sendLegacy(res, { data: legacyUser(user) });
});

export const legacyListUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = { role: 'customer', status: { $ne: 'deleted' } };
  if (req.query.search) filters.$or = [
    { name: new RegExp(req.query.search, 'i') },
    { email: new RegExp(req.query.search, 'i') }
  ];
  const [users, total] = await Promise.all([
    User.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filters)
  ]);
  const ids = users.map((user) => user._id);
  const [checkIns, reviews] = await Promise.all([
    CheckIn.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', count: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { user: { $in: ids }, status: { $ne: 'deleted' } } }, { $group: { _id: '$user', count: { $sum: 1 } } }])
  ]);
  const checkInMap = new Map(checkIns.map((item) => [String(item._id), item.count]));
  const reviewMap = new Map(reviews.map((item) => [String(item._id), item.count]));
  const data = users.map((user) => ({
    ...legacyUser(user),
    checkInCount: checkInMap.get(String(user._id)) || 0,
    reviewCount: reviewMap.get(String(user._id)) || 0
  }));
  sendLegacy(res, { data, meta: legacyMeta(total, page, limit) });
});

export const legacyBulkDeleteUsers = catchAsync(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  let deletedCount = 0;
  for (const id of ids) {
    const user = await User.findById(id);
    if (user && user.role !== 'admin' && user.status !== 'deleted') {
      await deleteAccountCascade(id);
      deletedCount += 1;
    }
  }
  sendLegacy(res, { deletedCount, skippedCount: ids.length - deletedCount });
});

export const legacyListOwners = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = { role: 'restaurant_owner', status: { $ne: 'deleted' } };
  if (req.query.search) filters.$or = [
    { name: new RegExp(req.query.search, 'i') },
    { email: new RegExp(req.query.search, 'i') }
  ];
  const [owners, total] = await Promise.all([
    User.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filters)
  ]);
  sendLegacy(res, { data: owners.map(legacyUser), meta: legacyMeta(total, page, limit) });
});

export const legacyCreateOwner = catchAsync(async (req, res) => {
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    passwordHash: await bcrypt.hash(req.body.password, 12),
    phone: req.body.phoneNumber,
    country: req.body.country,
    cityState: req.body.cityState,
    role: 'restaurant_owner',
    emailVerified: true,
    emailVerifiedAt: new Date()
  });
  sendLegacy(res, { data: legacyUser(user) }, StatusCodes.CREATED, 'Restaurant owner created');
});

export const legacyUpdateOwner = catchAsync(async (req, res) => {
  const updates = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phoneNumber,
    country: req.body.country,
    cityState: req.body.cityState
  };
  Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
  if (req.body.password) updates.passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'restaurant_owner', status: { $ne: 'deleted' } },
    updates,
    { new: true, runValidators: true }
  );
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant owner not found');
  sendLegacy(res, { data: legacyUser(user) });
});
