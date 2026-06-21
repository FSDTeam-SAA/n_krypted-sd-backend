import mongoose from 'mongoose';
import { stripPrivateFields } from './shared.js';

const restaurantViewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    ip: String,
    userAgent: String
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

restaurantViewSchema.index({ restaurant: 1, createdAt: -1 });

const RestaurantView = mongoose.model('RestaurantView', restaurantViewSchema);

export default RestaurantView;
