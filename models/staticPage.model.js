import mongoose from 'mongoose';
import { stripPrivateFields } from './shared.js';

const staticPageSchema = new mongoose.Schema(
  {
    slug: { type: String, enum: ['terms', 'privacy'], required: true, unique: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true }
  },
  {
    timestamps: true,
    toJSON: { transform: stripPrivateFields },
    toObject: { transform: stripPrivateFields }
  }
);

const StaticPage = mongoose.model('StaticPage', staticPageSchema);

export default StaticPage;
