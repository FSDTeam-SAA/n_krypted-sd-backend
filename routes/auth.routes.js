import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import {
  changePassword,
  deleteMe,
  forgotPassword,
  getMe,
  login,
  logout,
  refreshToken,
  register,
  resendVerificationOtp,
  resetPassword,
  updateMe,
  verifyEmailOtp,
  verifyPasswordResetOtp
} from '../controllers/auth.controller.js';
import {
  changePasswordSchema,
  emailSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  updateMeSchema,
  verifyOtpSchema
} from '../validations/auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh-token', validate(refreshTokenSchema), refreshToken);
router.post('/verify-email', validate(verifyOtpSchema), verifyEmailOtp);
router.post('/resend-verification-otp', validate(emailSchema), resendVerificationOtp);
router.post('/forgot-password', validate(emailSchema), forgotPassword);
router.post('/verify-password-reset-otp', validate(verifyOtpSchema), verifyPasswordResetOtp);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

router.get('/me', protect, getMe);
router.patch('/me', protect, upload.single('avatar'), validate(updateMeSchema), updateMe);
router.patch('/change-password', protect, validate(changePasswordSchema), changePassword);
router.post('/logout', protect, logout);
router.delete('/me', protect, deleteMe);

export default router;
