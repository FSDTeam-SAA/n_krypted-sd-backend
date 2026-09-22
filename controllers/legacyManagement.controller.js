import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import {
  assertOwnerOrAdmin,
  dishInput,
  populateLegacyRestaurants,
  parseJson,
  restaurantInput,
  sendLegacy,
  uploadedImages
} from '../utils/legacyApi.js';
import { legacyMeta, legacyRestaurant } from '../utils/legacySerializers.js';
import { getPagination } from '../utils/pagination.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import User from '../models/user.model.js';
import Review from '../models/review.model.js';
import SavedItem from '../models/savedItem.model.js';

const getRestaurant = async (id) => {
  const restaurant = await Restaurant.findOne({ _id: id, status: { $ne: 'deleted' } }).populate('owner');
  if (!restaurant) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  return restaurant;
};

const withDishes = async (restaurant) => {
  const dishes = await Dish.find({ restaurant: restaurant._id, status: { $ne: 'deleted' } });
  return legacyRestaurant(restaurant, dishes);
};

const saveRestaurantImages = async (req, restaurantId) => {
  if (req.files?.length || req.body.existingImages !== undefined) {
    return uploadedImages(req.files, `restaurants/${restaurantId}`, req.body.existingImages);
  }
  return undefined;
};

export const legacyManageRestaurants = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = { status: { $ne: 'deleted' } };
  if (req.user.role === 'restaurant_owner') filters.owner = req.user._id;
  if (req.query.status === 'activate') filters.status = 'active';
  if (req.query.status === 'deactivate') filters.status = { $in: ['pending', 'inactive', 'blocked'] };
  if (req.query.title) filters.name = new RegExp(req.query.title, 'i');
  const [restaurants, total] = await Promise.all([
    Restaurant.find(filters).populate('owner').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Restaurant.countDocuments(filters)
  ]);
  sendLegacy(res, {
    restaurants: await populateLegacyRestaurants(restaurants),
    pagination: legacyMeta(total, page, limit)
  });
});

export const legacyManageRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  sendLegacy(res, { restaurant: await withDishes(restaurant) });
});

export const legacyGetOwnerRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ owner: req.user._id, status: { $ne: 'deleted' } }).populate('owner');
  sendLegacy(res, { restaurant: restaurant ? await withDishes(restaurant) : null });
});

export const legacyCreateOwnerRestaurant = catchAsync(async (req, res) => {
  if (await Restaurant.exists({ owner: req.user._id, status: { $ne: 'deleted' } })) {
    throw new ApiError(StatusCodes.CONFLICT, 'Restaurant already exists for this owner');
  }
  const restaurant = new Restaurant({ ...restaurantInput(req.body), owner: req.user._id, status: 'pending' });
  restaurant.gallery = await saveRestaurantImages(req, restaurant._id) || [];
  await restaurant.save();
  await restaurant.populate('owner');
  sendLegacy(res, { restaurant: await withDishes(restaurant) }, StatusCodes.CREATED, 'Restaurant submitted');
});

export const legacyResubmitOwnerRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  Object.assign(restaurant, restaurantInput(req.body));
  const images = await saveRestaurantImages(req, restaurant._id);
  if (images) restaurant.gallery = images;
  restaurant.status = 'pending';
  restaurant.rejectionReason = undefined;
  await restaurant.save();
  sendLegacy(res, { restaurant: await withDishes(restaurant) });
});

export const legacyCreateAdminRestaurant = catchAsync(async (req, res) => {
  const ownerData = parseJson(req.body.owner, {}) || {};
  let owner = await User.findOne({ email: ownerData.email?.toLowerCase(), status: { $ne: 'deleted' } });
  if (owner && owner.role !== 'restaurant_owner') {
    throw new ApiError(StatusCodes.CONFLICT, 'This email belongs to a non-owner account');
  }
  if (!owner) {
    owner = await User.create({
      name: ownerData.name,
      email: ownerData.email,
      passwordHash: await bcrypt.hash(ownerData.password, 12),
      phone: ownerData.phoneNumber,
      role: 'restaurant_owner',
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
  }
  if (await Restaurant.exists({ owner: owner._id, status: { $ne: 'deleted' } })) {
    throw new ApiError(StatusCodes.CONFLICT, 'This owner already has a restaurant');
  }
  const restaurant = new Restaurant({ ...restaurantInput(req.body), owner: owner._id, status: 'active' });
  restaurant.gallery = await saveRestaurantImages(req, restaurant._id) || [];
  await restaurant.save();
  await restaurant.populate('owner');
  sendLegacy(res, { restaurant: await withDishes(restaurant) }, StatusCodes.CREATED, 'Restaurant created');
});

export const legacyUpdateRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  Object.assign(restaurant, restaurantInput(req.body));
  const images = await saveRestaurantImages(req, restaurant._id);
  if (images) restaurant.gallery = images;
  await restaurant.save();
  sendLegacy(res, { restaurant: await withDishes(restaurant) });
});

export const legacyApproval = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  restaurant.status = req.body.status === 'approved' ? 'active' : 'blocked';
  restaurant.rejectionReason = req.body.status === 'rejected' ? req.body.rejectionReason || 'Rejected by administrator' : undefined;
  await restaurant.save();
  sendLegacy(res, { restaurant: await withDishes(restaurant) });
});

export const legacyToggleRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  restaurant.status = restaurant.status === 'active' ? 'inactive' : 'active';
  await restaurant.save();
  sendLegacy(res, { restaurant: await withDishes(restaurant) });
});

export const legacyBulkDeleteRestaurants = catchAsync(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const restaurants = await Restaurant.find({ _id: { $in: ids }, status: { $ne: 'deleted' } });
  for (const restaurant of restaurants) {
    await Promise.all([
      Restaurant.findByIdAndUpdate(restaurant._id, { status: 'deleted', deletedAt: new Date() }),
      Dish.updateMany({ restaurant: restaurant._id }, { status: 'deleted', deletedAt: new Date() }),
      Review.updateMany({ restaurant: restaurant._id }, { status: 'deleted', deletedAt: new Date() }),
      SavedItem.deleteMany({ restaurant: restaurant._id })
    ]);
  }
  sendLegacy(res, { deletedCount: restaurants.length, skippedCount: ids.length - restaurants.length });
});

const restaurantAfterDishMutation = async (restaurant) => {
  await restaurant.populate('owner');
  return withDishes(restaurant);
};

export const legacyAddDish = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  const dish = new Dish({ ...dishInput(req.body), restaurant: restaurant._id });
  dish.images = await uploadedImages(req.files, `restaurants/${restaurant._id}/dishes`, req.body.existingImages);
  await dish.save();
  sendLegacy(res, { restaurant: await restaurantAfterDishMutation(restaurant) }, StatusCodes.CREATED, 'Dish created');
});

export const legacyUpdateDish = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  const dish = await Dish.findOne({ _id: req.params.dishId, restaurant: restaurant._id, status: { $ne: 'deleted' } });
  if (!dish) throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  Object.assign(dish, dishInput(req.body));
  if (req.files?.length || req.body.existingImages !== undefined) {
    dish.images = await uploadedImages(req.files, `restaurants/${restaurant._id}/dishes`, req.body.existingImages);
  }
  await dish.save();
  sendLegacy(res, { restaurant: await restaurantAfterDishMutation(restaurant) });
});

export const legacyDeleteDish = catchAsync(async (req, res) => {
  const restaurant = await getRestaurant(req.params.id);
  assertOwnerOrAdmin(req.user, restaurant);
  const dish = await Dish.findOneAndUpdate(
    { _id: req.params.dishId, restaurant: restaurant._id, status: { $ne: 'deleted' } },
    { status: 'deleted', deletedAt: new Date() },
    { new: true }
  );
  if (!dish) throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  await Promise.all([
    Review.updateMany({ dish: dish._id }, { status: 'deleted', deletedAt: new Date() }),
    SavedItem.deleteMany({ dish: dish._id })
  ]);
  sendLegacy(res, { restaurant: await restaurantAfterDishMutation(restaurant) });
});
