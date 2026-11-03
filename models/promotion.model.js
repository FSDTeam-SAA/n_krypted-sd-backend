import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish' },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  text: { type: String, trim: true, maxlength: 2000, default: '' },
  bannerUrl: { type: String, default: '' },
  discountType: { type: String, enum: ['none', 'percent', 'amount'], default: 'none' },
  discountValue: { type: Number, min: 0, default: 0 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });
schema.index({ restaurant: 1, active: 1, startsAt: 1, endsAt: 1 });
export default mongoose.model('Promotion', schema);
