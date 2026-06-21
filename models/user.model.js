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

const User = mongoose.model('User', userSchema);

export default User;
