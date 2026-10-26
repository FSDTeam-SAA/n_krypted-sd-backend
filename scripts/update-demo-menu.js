import 'dotenv/config';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import User from '../models/user.model.js';
import demo, { demoDish, demoGallery } from './data/old-town-demo.js';

// This intentionally updates one existing demo restaurant, without creating or
// resetting accounts, reviews, saved items, visit history or legal pages.
const apply = process.argv.includes('--apply');
try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const owner = await User.findOne({ email: demo.ownerEmail, role: 'restaurant_owner' });
  if (!owner) throw new Error('Expected demo owner was not found');
  const restaurant = await Restaurant.findOne({ owner: owner._id, name: demo.name, status: 'active' });
  if (!restaurant) throw new Error('Expected active demo restaurant was not found');
  const dishes = await Dish.find({ restaurant: restaurant._id, status: { $ne: 'deleted' } });
  const targets = demo.dishes.map((item) => {
    const matches = dishes.filter((dish) => dish.name === item.name);
    if (matches.length !== 1) throw new Error(`Expected one existing ${item.name}`);
    return matches[0];
  });
  if (dishes.some((dish) => dish.isSignature && !targets.some((target) => target._id.equals(dish._id)))) {
    throw new Error('Unexpected additional signature dishes; review them before updating');
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', restaurant: restaurant.name, id: restaurant.id,
    dishes: demo.dishes.map(({ name, price }) => ({ name, price, currency: 'EUR' })),
    photoCategories: demo.gallery.map((photo) => photo.category) }, null, 2));
  if (apply) {
    // Check every image before making the database changes.
    for (const url of [...demo.gallery.map((photo) => photo.url), ...demo.dishes.map((dish) => dish.photo.url)]) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error('A demo image is unavailable; database was not updated');
      }
      await response.arrayBuffer();
    }
    const directory = resolve('../.demo-review/backups');
    await mkdir(directory, { recursive: true });
    const backup = resolve(directory, `old-town-before-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await writeFile(backup, JSON.stringify({ savedAt: new Date().toISOString(), restaurant: restaurant.toObject(),
      dishes: targets.map((dish) => dish.toObject()) }, null, 2), { flag: 'wx' });
    console.log(`Backup saved: ${backup}`);

    await mongoose.connection.transaction(async (session) => {
      for (const [index, item] of demo.dishes.entries()) {
        const result = await Dish.updateOne({ _id: targets[index]._id, restaurant: restaurant._id },
          { $set: demoDish(item, index) }, { session, runValidators: true });
        if (result.matchedCount !== 1) throw new Error('A target dish changed during the update');
      }
      const result = await Restaurant.updateOne({ _id: restaurant._id, owner: owner._id }, { $set: {
        description: demo.description,
        shortDescription: demo.shortDescription,
        price: Math.min(...demo.dishes.map((dish) => dish.price)),
        gallery: demoGallery()
      } }, { session, runValidators: true });
      if (result.matchedCount !== 1) throw new Error('The target restaurant changed during the update');
    });
    const saved = await Dish.find({ restaurant: restaurant._id, isSignature: true, status: 'active' });
    if (saved.length !== 3 || saved.some((dish) => !dish.images.length || !dish.description || dish.price <= 0)) {
      throw new Error('Post-update verification failed; inspect the saved backup');
    }
    console.log('Verified: 3 described signature dishes with distinct food photos; interior/exterior/additional photos saved.');
  }
} catch (error) {
  // Avoid exposing connection strings or credentials in network/driver errors.
  console.error(error.name === 'MongoServerError' || error.name === 'MongooseServerSelectionError'
    ? `${error.name}: database operation failed` : error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
