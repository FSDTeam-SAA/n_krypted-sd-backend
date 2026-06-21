import mongoose from 'mongoose';
import { stripPrivateFields } from './shared.js';

const savedItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemType: { type: String, enum: ['restaurant', 'dish'], required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish' }
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

savedItemSchema.index(
  { user: 1, itemType: 1, restaurant: 1, dish: 1 },
  { unique: true }
);

savedItemSchema.pre('validate', function validateTarget(next) {
  if (this.itemType === 'restaurant' && !this.restaurant) {
    next(new Error('restaurant is required for restaurant saved items'));
    return;
  }

  if (this.itemType === 'dish' && !this.dish) {
    next(new Error('dish is required for dish saved items'));
    return;
  }

  next();
});

const SavedItem = mongoose.model('SavedItem', savedItemSchema);

export default SavedItem;
