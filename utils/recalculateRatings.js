import Dish from '../models/dish.model.js';
import Restaurant from '../models/restaurant.model.js';
import Review from '../models/review.model.js';

const calculateAggregate = async (match) => {
  const [aggregate] = await Review.aggregate([
    { $match: { ...match, status: 'active' } },
    {
      $group: {
        _id: null,
        average: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    ratingAverage: aggregate ? Number(aggregate.average.toFixed(1)) : 0,
    ratingCount: aggregate?.count || 0
  };
};

export const recalculateRestaurantRating = async (restaurantId) => {
  const rating = await calculateAggregate({ restaurant: restaurantId });
  await Restaurant.findByIdAndUpdate(restaurantId, rating);
  return rating;
};

export const recalculateDishRating = async (dishId) => {
  if (!dishId) return null;

  const rating = await calculateAggregate({ dish: dishId });
  await Dish.findByIdAndUpdate(dishId, rating);
  return rating;
};

export const recalculateReviewTargets = async (review) => {
  if (!review) return;

  await recalculateRestaurantRating(review.restaurant);
  if (review.dish) {
    await recalculateDishRating(review.dish);
  }
};
