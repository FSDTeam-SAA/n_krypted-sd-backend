import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import connectDatabase from '../config/database.js';
import CheckIn from '../models/checkIn.model.js';
import Dish from '../models/dish.model.js';
import Restaurant from '../models/restaurant.model.js';
import RestaurantView from '../models/restaurantView.model.js';
import Review from '../models/review.model.js';
import SavedItem from '../models/savedItem.model.js';
import StaticPage from '../models/staticPage.model.js';
import User from '../models/user.model.js';
import { recalculateDishRating, recalculateRestaurantRating } from '../utils/recalculateRatings.js';

const password = 'Password123!';
const owners = [
  ['Ayaan Rahman', 'owner1@example.com', '+8801700000101'],
  ['Nusrat Jahan', 'owner2@example.com', '+8801700000102'],
  ['Tanvir Ahmed', 'owner3@example.com', '+8801700000103'],
  ['Farzana Islam', 'owner4@example.com', '+8801700000104'],
  ['Mehedi Hasan', 'owner5@example.com', '+8801700000105']
];
const customers = [
  ['Arif Hossain', 'customer1@example.com', '+8801700000201'],
  ['Sadia Akter', 'customer2@example.com', '+8801700000202'],
  ['Rafiul Karim', 'customer3@example.com', '+8801700000203'],
  ['Tanjina Noor', 'customer4@example.com', '+8801700000204'],
  ['Sabbir Khan', 'customer5@example.com', '+8801700000205']
];
const restaurantSeeds = [
  ['Dhaka Spice House', 'Bangladeshi', 'Gulshan Avenue, Gulshan 2', [90.4152, 23.7925], '$$', '10% off on family platters'],
  ['Bengal Bistro', 'Bengali', 'Road 11, Banani', [90.4043, 23.7937], '$$$', 'Complimentary dessert'],
  ['Urban Kebab', 'Middle Eastern', 'Satmasjid Road, Dhanmondi', [90.3687, 23.7461], '$$', 'Buy one kebab platter, get a drink'],
  ['Green Garden Cafe', 'Cafe', 'Uttara Sector 7', [90.3995, 23.8759], '$', '20% off before 5 PM'],
  ['Old Town Kitchen', 'Mughlai', 'Nazimuddin Road, Old Dhaka', [90.3958, 23.7224], '$$$', 'Free delivery within 3 km']
];
const dishSeeds = [
  [['Kacchi Biryani', 450, 'Main Course', true], ['Beef Kala Bhuna', 380, 'Main Course', false], ['Borhani', 120, 'Beverage', false]],
  [['Hilsa Mustard Curry', 520, 'Main Course', true], ['Bengali Thali', 390, 'Main Course', false], ['Mishti Doi', 160, 'Dessert', false]],
  [['Mixed Kebab Platter', 690, 'Grill', true], ['Chicken Shawarma', 280, 'Wrap', false], ['Hummus and Pita', 240, 'Starter', false]],
  [['Garden Club Sandwich', 320, 'Sandwich', true], ['Pasta Alfredo', 410, 'Pasta', false], ['Cold Coffee', 190, 'Beverage', false]],
  [['Mutton Rezala', 560, 'Main Course', true], ['Morog Polao', 420, 'Main Course', false], ['Shahi Tukra', 180, 'Dessert', false]]
];
// Populate the client's full four-signature layout as well as regular dishes.
const additionalSignatures = [
  [['Chicken Roast', 360, 'Main Course'], ['Chingri Malai Curry', 480, 'Main Course'], ['Firni', 140, 'Dessert']],
  [['Kosha Mangsho', 490, 'Main Course'], ['Prawn Paturi', 450, 'Main Course'], ['Sandesh', 150, 'Dessert']],
  [['Lamb Kofta', 540, 'Grill'], ['Chicken Shish', 420, 'Grill'], ['Baklava', 180, 'Dessert']],
  [['Mushroom Risotto', 430, 'Main Course'], ['Grilled Vegetable Bowl', 350, 'Main Course'], ['Lemon Cheesecake', 210, 'Dessert']],
  [['Beef Tehari', 390, 'Main Course'], ['Chicken Korma', 460, 'Main Course'], ['Zarda', 160, 'Dessert']]
];
additionalSignatures.forEach((extra, index) => {
  dishSeeds[index].push(...extra.map((dish) => [...dish, true]));
});
const photoIds = ['photo-1517248135467-4c7edcad34c4', 'photo-1552566626-52f8b828add9', 'photo-1555396273-367ea4eb4db5', 'photo-1559339352-11d035aa65de', 'photo-1414235077428-338989a2e8c0'];
const image = (id, photoId, alt) => ({ public_id: `seed/${id}`, secure_url: `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`, width: 1200, height: 800, format: 'jpg', alt });
const openingHours = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, open: '10:00', close: '23:00', closed: false }));

const upsertUsers = async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const verifiedAt = new Date();
  const seeds = [...owners.map((data) => [data, 'restaurant_owner']), ...customers.map((data) => [data, 'customer'])];
  await Promise.all(seeds.map(([[name, email, phone], role]) => User.updateOne(
    { email },
    { $set: { name, phone, role, passwordHash, country: 'Bangladesh', cityState: 'Dhaka', emailVerified: true, emailVerifiedAt: verifiedAt, status: 'active' }, $setOnInsert: { email } },
    { upsert: true, runValidators: true }
  )));
  return {
    ownerUsers: await User.find({ email: { $in: owners.map((item) => item[1]) } }).sort({ email: 1 }),
    customerUsers: await User.find({ email: { $in: customers.map((item) => item[1]) } }).sort({ email: 1 })
  };
};

const upsertRestaurantsAndDishes = async (ownerUsers) => {
  const restaurants = [];
  const dishes = [];
  for (let i = 0; i < ownerUsers.length; i += 1) {
    const [name, category, address, coordinates, priceRange, offer] = restaurantSeeds[i];
    const restaurant = await Restaurant.findOneAndUpdate(
      { owner: ownerUsers[i]._id },
      { $set: { name, shortDescription: `${category} food prepared with fresh ingredients`, email: `restaurant${i + 1}@example.com`, phone: `+880180000030${i + 1}`, address, city: 'Dhaka', country: 'Bangladesh', description: `${name} serves authentic ${category} dishes in a welcoming, family-friendly setting.`, price: 500 + i * 100, location: { type: 'Point', coordinates }, categories: [category, 'Popular', 'Family Friendly'], priceRange, openingHours, reservationRequired: i % 2 === 1, gallery: ['interior', 'exterior', 'other'].flatMap((category, section) =>
          Array.from({ length: 4 }, (_, photo) => ({
            ...image(`restaurant-${i + 1}-${category}-${photo + 1}`, photoIds[(i + section + photo) % photoIds.length], `${name}: ${category} ${photo + 1}`),
            category
          }))), offers: [offer], status: 'active' } },
      { upsert: true, new: true, runValidators: true }
    );
    restaurants.push(restaurant);
    const restaurantDishes = [];
    for (let j = 0; j < dishSeeds[i].length; j += 1) {
      const [dishName, price, dishCategory, isSignature] = dishSeeds[i][j];
      const dish = await Dish.findOneAndUpdate(
        { restaurant: restaurant._id, name: dishName },
        { $set: { description: `${dishName} made to order with carefully selected ingredients.`, price, category: dishCategory, specialtyDescription: isSignature ? `The signature dish of ${name}` : '', images: [image(`dish-${i + 1}-${j + 1}`, photoIds[(i + j) % photoIds.length], dishName)], ingredients: ['Fresh ingredients', 'House spices', 'Herbs'], nutrition: { calories: 350 + j * 120, protein: '18g', carbs: '42g', fat: '14g' }, preparationMethod: 'Prepared fresh in the restaurant kitchen.', isSignature, status: 'active' } },
        { upsert: true, new: true, runValidators: true }
      );
      restaurantDishes.push(dish);
    }
    dishes.push(restaurantDishes);
  }
  return { restaurants, dishes };
};

const upsertActivity = async (customerUsers, restaurants, dishes) => {
  for (let i = 0; i < customerUsers.length; i += 1) {
    const customer = customerUsers[i];
    for (let offset = 0; offset < 2; offset += 1) {
      const restaurantIndex = (i + offset) % restaurants.length;
      const restaurant = restaurants[restaurantIndex];
      const dish = dishes[restaurantIndex][offset];
      const checkIn = await CheckIn.findOneAndUpdate(
        { user: customer._id, restaurant: restaurant._id },
        { $set: { location: restaurant.location, accuracy: 8 + offset, partySize: 1 + ((i + offset) % 4), distanceMeters: 12 + offset * 7, status: 'verified' } },
        { upsert: true, new: true, runValidators: true }
      );
      await Review.findOneAndUpdate(
        { user: customer._id, restaurant: restaurant._id, dish: dish._id, reviewType: 'customer' },
        { $set: { checkIn: checkIn._id, rating: 4 + ((i + offset) % 2), comment: offset === 0 ? 'Excellent food, friendly service, and a comfortable atmosphere.' : 'Fresh and flavorful. I would happily visit again.', status: 'active', images: [] } },
        { upsert: true, new: true, runValidators: true }
      );
    }
    const savedRestaurant = restaurants[i];
    const savedDish = dishes[(i + 1) % dishes.length][0];
    await Promise.all([
      SavedItem.updateOne({ user: customer._id, itemType: 'restaurant', restaurant: savedRestaurant._id }, { $setOnInsert: { user: customer._id, itemType: 'restaurant', restaurant: savedRestaurant._id } }, { upsert: true, runValidators: true }),
      SavedItem.updateOne({ user: customer._id, itemType: 'dish', dish: savedDish._id }, { $setOnInsert: { user: customer._id, itemType: 'dish', dish: savedDish._id } }, { upsert: true, runValidators: true })
    ]);
    for (let offset = 0; offset < 3; offset += 1) {
      const restaurant = restaurants[(i + offset) % restaurants.length];
      const ip = `seed-${i + 1}-${offset + 1}`;
      await RestaurantView.updateOne({ user: customer._id, restaurant: restaurant._id, ip }, { $setOnInsert: { user: customer._id, restaurant: restaurant._id, ip, userAgent: 'n_krypted demo seed' } }, { upsert: true });
    }
  }
};

const updateAggregates = async (restaurants, dishes) => {
  for (let i = 0; i < restaurants.length; i += 1) {
    await recalculateRestaurantRating(restaurants[i]._id);
    await Promise.all(dishes[i].map(({ _id }) => recalculateDishRating(_id)));
    const [checkInCount, viewCount] = await Promise.all([CheckIn.countDocuments({ restaurant: restaurants[i]._id }), RestaurantView.countDocuments({ restaurant: restaurants[i]._id })]);
    await Restaurant.findByIdAndUpdate(restaurants[i]._id, { checkInCount, viewCount });
  }
};

const upsertStaticPages = () => Promise.all([
  StaticPage.updateOne({ slug: 'terms' }, { $set: { title: 'Terms and Conditions', content: '<h1>Terms and Conditions</h1><p>Demo terms for the n_krypted application.</p>' } }, { upsert: true, runValidators: true }),
  StaticPage.updateOne({ slug: 'privacy' }, { $set: { title: 'Privacy Policy', content: '<h1>Privacy Policy</h1><p>Demo privacy policy for the n_krypted application.</p>' } }, { upsert: true, runValidators: true })
]);

const seedDatabase = async () => {
  try {
    await connectDatabase();
    const { ownerUsers, customerUsers } = await upsertUsers();
    const { restaurants, dishes } = await upsertRestaurantsAndDishes(ownerUsers);
    await upsertActivity(customerUsers, restaurants, dishes);
    await updateAggregates(restaurants, dishes);
    await upsertStaticPages();
    const userIds = [...ownerUsers, ...customerUsers].map(({ _id }) => _id);
    const customerIds = customerUsers.map(({ _id }) => _id);
    const restaurantIds = restaurants.map(({ _id }) => _id);
    const counts = {
      owners: await User.countDocuments({ _id: { $in: userIds }, role: 'restaurant_owner' }),
      customers: await User.countDocuments({ _id: { $in: userIds }, role: 'customer' }),
      restaurants: await Restaurant.countDocuments({ _id: { $in: restaurantIds } }),
      dishes: await Dish.countDocuments({ restaurant: { $in: restaurantIds } }),
      checkIns: await CheckIn.countDocuments({ user: { $in: customerIds }, restaurant: { $in: restaurantIds } }),
      reviews: await Review.countDocuments({ user: { $in: customerIds }, restaurant: { $in: restaurantIds } }),
      savedItems: await SavedItem.countDocuments({ user: { $in: customerIds } }),
      views: await RestaurantView.countDocuments({ user: { $in: customerIds }, restaurant: { $in: restaurantIds } })
    };
    console.log('Full demo seed completed and verified:');
    console.table(counts);
    console.log(`All demo account passwords: ${password}`);
  } finally {
    await mongoose.disconnect();
  }
};

seedDatabase().catch((error) => {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
});
