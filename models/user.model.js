import mongoose from 'mongoose';
import { imageSchema, stripPrivateFields } from './shared.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['customer', 'restaurant_owner', 'admin'],
      default: 'customer'
    },
    avatar: imageSchema,
    phone: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: Date,
    emailVerificationOtpHash: { type: String, select: false },
    emailVerificationOtpExpiresAt: { type: Date, select: false },
    passwordResetOtpHash: { type: String, select: false },
    passwordResetOtpExpiresAt: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false },
    refreshTokenHash: { type: String, select: false },
    refreshTokenExpiresAt: { type: Date, select: false },
    status: {
      type: String,
      enum: ['active', 'pending', 'blocked', 'deleted'],
      default: 'active'
    },
    deletedAt: Date
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ emailVerified: 1 });

const User = mongoose.model('User', userSchema);

export default User;
