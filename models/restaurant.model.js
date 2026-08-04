import mongoose from 'mongoose';
import { imageSchema, pointSchema, stripPrivateFields } from './shared.js';

const openingHourSchema = new mongoose.Schema(
  {
    day: String,
    open: String,
    close: String,
    closed: { type: Boolean, default: false }
  },
  { _id: false }
);

const restaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    description: { type: String, trim: true },
    location: {
      type: pointSchema,
      default: undefined
    },
    categories: [{ type: String, trim: true }],
    priceRange: {
      type: String,
      enum: ['$', '$$', '$$$', '$$$$'],
      default: '$$'
    },
    openingHours: [openingHourSchema],
    gallery: [imageSchema],
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'blocked', 'deleted'],
      default: 'pending',
      index: true
    },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    checkInCount: { type: Number, default: 0 },
    deletedAt: Date
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ name: 'text', address: 'text', categories: 'text' });
restaurantSchema.index({ status: 1, ratingAverage: -1 });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
