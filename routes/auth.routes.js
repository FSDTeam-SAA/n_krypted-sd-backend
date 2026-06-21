import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import {
  changePassword,
  deleteMe,
  getMe,
  login,
  register,
  updateMe
} from '../controllers/auth.controller.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateMeSchema
} from '../validations/auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);

router.get('/me', protect, getMe);
router.patch('/me', protect, upload.single('avatar'), validate(updateMeSchema), updateMe);
router.patch('/change-password', protect, validate(changePasswordSchema), changePassword);
router.delete('/me', protect, deleteMe);

export default router;
