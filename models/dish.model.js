import mongoose from 'mongoose';
import { imageSchema, stripPrivateFields } from './shared.js';

const nutritionSchema = new mongoose.Schema(
  {
    calories: Number,
    protein: String,
    carbs: String,
    fat: String,
    notes: String
  },
  { _id: false }
);

const dishSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true },
    images: [imageSchema],
    ingredients: [{ type: String, trim: true }],
    nutrition: nutritionSchema,
    preparationMethod: { type: String, trim: true },
    isSignature: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive', 'deleted'],
      default: 'active',
      index: true
    },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    deletedAt: Date
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

dishSchema.index({ name: 'text', description: 'text', category: 'text' });
dishSchema.index({ restaurant: 1, status: 1, isSignature: -1 });

const Dish = mongoose.model('Dish', dishSchema);

export default Dish;
