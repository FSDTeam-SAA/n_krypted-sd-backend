import SavedItem from '../models/savedItem.model.js';

const toPlain = (item) => {
  if (!item) return item;
  return typeof item.toObject === 'function' ? item.toObject() : { ...item };
};

const addFlag = (items, savedIds) => {
  return items.map((item) => {
    const plain = toPlain(item);
    return {
      ...plain,
      isSaved: savedIds.has(String(plain._id))
    };
  });
};

export const addSavedFlags = async (userId, { restaurants = [], dishes = [] } = {}) => {
  const restaurantItems = Array.isArray(restaurants) ? restaurants : [restaurants].filter(Boolean);
  const dishItems = Array.isArray(dishes) ? dishes : [dishes].filter(Boolean);

  if (!userId) {
    return {
      restaurants: addFlag(restaurantItems, new Set()),
      dishes: addFlag(dishItems, new Set())
    };
  }

  const [savedRestaurants, savedDishes] = await Promise.all([
    restaurantItems.length
      ? SavedItem.find({
        user: userId,
        itemType: 'restaurant',
        restaurant: { $in: restaurantItems.map((item) => item._id) }
      }).select('restaurant')
      : [],
    dishItems.length
      ? SavedItem.find({
        user: userId,
        itemType: 'dish',
        dish: { $in: dishItems.map((item) => item._id) }
      }).select('dish')
      : []
  ]);

  const restaurantIds = new Set(savedRestaurants.map((item) => String(item.restaurant)));
  const dishIds = new Set(savedDishes.map((item) => String(item.dish)));

  return {
    restaurants: addFlag(restaurantItems, restaurantIds),
    dishes: addFlag(dishItems, dishIds)
  };
};
