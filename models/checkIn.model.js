import mongoose from 'mongoose';
import { pointSchema, stripPrivateFields } from './shared.js';

const checkInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    location: {
      type: pointSchema,
      default: undefined
    },
    accuracy: { type: Number, min: 0 },
    partySize: { type: Number, min: 1, default: 1 },
    distanceMeters: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['verified'], default: 'verified' }
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

checkInSchema.index({ restaurant: 1, createdAt: -1 });

const CheckIn = mongoose.model('CheckIn', checkInSchema);

export default CheckIn;
