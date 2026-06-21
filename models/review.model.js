import mongoose from 'mongoose';
import { imageSchema, stripPrivateFields } from './shared.js';

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    images: [imageSchema],
    status: {
      type: String,
      enum: ['active', 'hidden', 'deleted'],
      default: 'active',
      index: true
    },
    deletedAt: Date
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

reviewSchema.index({ restaurant: 1, status: 1, createdAt: -1 });
reviewSchema.index({ dish: 1, status: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
