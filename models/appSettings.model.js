import mongoose from 'mongoose';

export default mongoose.model('AppSettings', new mongoose.Schema({
  key: { type: String, unique: true, default: 'public' },
  instagramUrl: { type: String, default: '' },
  tiktokUrl: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  contactAddress: { type: String, default: '' },
  showTeamReviews: { type: Boolean, default: true }
}, { timestamps: true }));
