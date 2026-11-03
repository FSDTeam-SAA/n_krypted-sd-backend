import 'dotenv/config';
import mongoose from 'mongoose';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import connectDatabase from '../config/database.js';

// Defaults to a read-only preview. Review output before passing --apply.
const apply = process.argv.includes('--apply');
await connectDatabase();
try {
  const restaurants = await Restaurant.find({ status: { $ne: 'deleted' } }).select('name price gallery');
  for (const restaurant of restaurants) {
    const dishes = await Dish.find({ restaurant: restaurant._id, status: 'active' }).select('price');
    const price = dishes.length ? Math.min(...dishes.map((dish) => dish.price)) : 0;
    if (restaurant.gallery.length > 10) console.log(JSON.stringify({ restaurant: String(restaurant._id), name: restaurant.name, galleryCount: restaurant.gallery.length, action: 'Owner must select up to 10 photos; no photos removed automatically' }));
    if (restaurant.price !== price) {
      console.log(JSON.stringify({ restaurant: String(restaurant._id), name: restaurant.name, previousPrice: restaurant.price, price, applied: apply }));
      if (apply) await Restaurant.updateOne({ _id: restaurant._id }, { price });
    }
  }
} finally { await mongoose.disconnect(); }
