import mongoose from 'mongoose';

export const imageSchema = new mongoose.Schema(
  {
    public_id: { type: String, required: true },
    secure_url: { type: String, required: true },
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
    alt: String,
    category: { type: String, enum: ['interior', 'exterior', 'other'], default: 'other' }
  },
  { _id: true }
);

export const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      validate: {
        validator(value) {
          return !value.length || (value.length === 2 && value.every(Number.isFinite)
            && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90);
        },
        message: 'Coordinates must be [longitude, latitude]'
      },
      default: undefined
    }
  },
  { _id: false }
);

export const stripPrivateFields = (doc, ret) => {
  delete ret.passwordHash;
  delete ret.emailVerificationOtpHash;
  delete ret.emailVerificationOtpExpiresAt;
  delete ret.passwordResetOtpHash;
  delete ret.passwordResetOtpExpiresAt;
  delete ret.passwordResetTokenHash;
  delete ret.passwordResetTokenExpiresAt;
  delete ret.refreshTokenHash;
  delete ret.refreshTokenExpiresAt;
  delete ret.__v;
  return ret;
};
