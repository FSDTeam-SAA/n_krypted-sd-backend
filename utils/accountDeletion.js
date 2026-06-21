import CheckIn from '../models/checkIn.model.js';
import Dish from '../models/dish.model.js';
import Restaurant from '../models/restaurant.model.js';
import RestaurantView from '../models/restaurantView.model.js';
import Review from '../models/review.model.js';
import SavedItem from '../models/savedItem.model.js';
import User from '../models/user.model.js';
import { recalculateDishRating, recalculateRestaurantRating } from './recalculateRatings.js';

const uniqueIds = (values) => [...new Set(values.filter(Boolean).map((value) => value.toString()))];

const addIds = (target, docs, field) => {
  docs.forEach((doc) => {
    if (doc[field]) target.push(doc[field]);
  });
};

export const recalculateEngagementCounts = async (restaurantIds) => {
  await Promise.all(uniqueIds(restaurantIds).map(async (restaurantId) => {
    const [viewCount, checkInCount] = await Promise.all([
      RestaurantView.countDocuments({ restaurant: restaurantId }),
      CheckIn.countDocuments({ restaurant: restaurantId })
    ]);

    await Restaurant.findByIdAndUpdate(restaurantId, { viewCount, checkInCount });
  }));
};

export const deleteAccountCascade = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const deletedAt = new Date();
  const affectedRestaurantIds = [];
  const affectedDishIds = [];

  const [userReviews, userCheckIns, userViews] = await Promise.all([
    Review.find({ user: user._id, status: { $ne: 'deleted' } }).select('restaurant dish'),
    CheckIn.find({ user: user._id }).select('restaurant'),
    RestaurantView.find({ user: user._id }).select('restaurant')
  ]);

  addIds(affectedRestaurantIds, userReviews, 'restaurant');
  addIds(affectedDishIds, userReviews, 'dish');
  addIds(affectedRestaurantIds, userCheckIns, 'restaurant');
  addIds(affectedRestaurantIds, userViews, 'restaurant');

  await Promise.all([
    Review.updateMany(
      { user: user._id, status: { $ne: 'deleted' } },
      { status: 'deleted', deletedAt }
    ),
    SavedItem.deleteMany({ user: user._id }),
    CheckIn.deleteMany({ user: user._id }),
    RestaurantView.deleteMany({ user: user._id })
  ]);

  if (user.role === 'restaurant_owner') {
    const ownerRestaurants = await Restaurant.find({
      owner: user._id,
      status: { $ne: 'deleted' }
    }).select('_id');
    const ownerRestaurantIds = ownerRestaurants.map((restaurant) => restaurant._id);

    if (ownerRestaurantIds.length) {
      const ownerDishes = await Dish.find({
        restaurant: { $in: ownerRestaurantIds },
        status: { $ne: 'deleted' }
      }).select('_id');
      const ownerDishIds = ownerDishes.map((dish) => dish._id);

      affectedRestaurantIds.push(...ownerRestaurantIds);
      affectedDishIds.push(...ownerDishIds);

      await Promise.all([
        Restaurant.updateMany(
          { _id: { $in: ownerRestaurantIds } },
          { status: 'deleted', deletedAt }
        ),
        Dish.updateMany(
          { restaurant: { $in: ownerRestaurantIds }, status: { $ne: 'deleted' } },
          { status: 'deleted', deletedAt }
        ),
        Review.updateMany(
          { restaurant: { $in: ownerRestaurantIds }, status: { $ne: 'deleted' } },
          { status: 'deleted', deletedAt }
        ),
        SavedItem.deleteMany({
          $or: [
            { restaurant: { $in: ownerRestaurantIds } },
            { dish: { $in: ownerDishIds } }
          ]
        }),
        CheckIn.deleteMany({ restaurant: { $in: ownerRestaurantIds } }),
        RestaurantView.deleteMany({ restaurant: { $in: ownerRestaurantIds } })
      ]);
    }
  }

  await User.findByIdAndUpdate(user._id, { status: 'deleted', deletedAt });

  await Promise.all([
    ...uniqueIds(affectedRestaurantIds).map((restaurantId) => recalculateRestaurantRating(restaurantId)),
    ...uniqueIds(affectedDishIds).map((dishId) => recalculateDishRating(dishId))
  ]);

  await recalculateEngagementCounts(affectedRestaurantIds);

  return User.findById(user._id);
};
