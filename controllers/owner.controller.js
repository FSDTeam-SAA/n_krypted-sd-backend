import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { deleteCloudinaryImage, streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import { recalculateDishRating, recalculateRestaurantRating } from '../utils/recalculateRatings.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import Review from '../models/review.model.js';
import CheckIn from '../models/checkIn.model.js';
import RestaurantView from '../models/restaurantView.model.js';

const getOwnerRestaurantOrFail = async (ownerId) => {
  const restaurant = await Restaurant.findOne({
    owner: ownerId,
    status: { $ne: 'deleted' }
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant profile not found for this owner');
  }

  return restaurant;
};

const allowedRestaurantFields = [
  'name',
  'email',
  'phone',
  'address',
  'description',
  'location',
  'categories',
  'priceRange',
  'openingHours'
];

const allowedDishFields = [
  'name',
  'description',
  'price',
  'category',
  'images',
  'ingredients',
  'nutrition',
  'preparationMethod',
  'isSignature',
  'status'
];

const pick = (body, allowedFields) => {
  const updates = {};
  allowedFields.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });
  return updates;
};

export const createOwnerRestaurant = catchAsync(async (req, res) => {
  const existingRestaurant = await Restaurant.exists({
    owner: req.user._id,
    status: { $ne: 'deleted' }
  });

  if (existingRestaurant) {
    throw new ApiError(StatusCodes.CONFLICT, 'Restaurant profile already exists for this owner');
  }

  const restaurant = await Restaurant.create({
    ...pick(req.body, allowedRestaurantFields),
    owner: req.user._id,
    status: 'pending'
  });

  sendSuccess(res, StatusCodes.CREATED, 'Restaurant profile created and pending admin approval', { restaurant });
});

export const getOwnerDashboard = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);

  const [totalDishes, totalReviews, viewers, checkIns, signatureDishes, recentReviews] = await Promise.all([
    Dish.countDocuments({ restaurant: restaurant._id, status: { $ne: 'deleted' } }),
    Review.countDocuments({ restaurant: restaurant._id, status: { $ne: 'deleted' } }),
    RestaurantView.countDocuments({ restaurant: restaurant._id }),
    CheckIn.countDocuments({ restaurant: restaurant._id }),
    Dish.find({ restaurant: restaurant._id, isSignature: true, status: { $ne: 'deleted' } }).limit(5),
    Review.find({ restaurant: restaurant._id, status: { $ne: 'deleted' } })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(5)
  ]);

  sendSuccess(res, StatusCodes.OK, 'Owner dashboard fetched successfully', {
    restaurant,
    metrics: {
      totalDishes,
      totalReviews,
      viewers,
      checkIns,
      ratingAverage: restaurant.ratingAverage,
      ratingCount: restaurant.ratingCount
    },
    signatureDishes,
    recentReviews
  });
});

export const getOwnerRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  sendSuccess(res, StatusCodes.OK, 'Owner restaurant fetched successfully', { restaurant });
});

export const updateOwnerRestaurant = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const updates = pick(req.body, allowedRestaurantFields);

  const updatedRestaurant = await Restaurant.findByIdAndUpdate(restaurant._id, updates, {
    new: true,
    runValidators: true
  });

  sendSuccess(res, StatusCodes.OK, 'Restaurant profile updated successfully', { restaurant: updatedRestaurant });
});

export const uploadRestaurantGallery = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);

  if (!req.files?.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Please upload at least one image file');
  }

  const images = await Promise.all(
    req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `restaurants/${restaurant._id}`)))
  );

  restaurant.gallery.push(...images);
  await restaurant.save();

  sendSuccess(res, StatusCodes.CREATED, 'Restaurant gallery updated successfully', {
    images,
    restaurant
  });
});

export const deleteRestaurantGalleryImage = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const image = restaurant.gallery.id(req.params.id);

  if (!image) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Gallery image not found');
  }

  await deleteCloudinaryImage(image.public_id);
  image.deleteOne();
  await restaurant.save();

  sendSuccess(res, StatusCodes.OK, 'Restaurant gallery image deleted successfully', { restaurant });
});

export const listOwnerDishes = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const { page, limit, skip } = getPagination(req.query);
  const filters = { restaurant: restaurant._id, status: { $ne: 'deleted' } };

  if (req.query.category) filters.category = req.query.category;
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    filters.$or = [{ name: regex }, { description: regex }, { category: regex }];
  }

  const [dishes, total] = await Promise.all([
    Dish.find(filters).sort({ isSignature: -1, createdAt: -1 }).skip(skip).limit(limit),
    Dish.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Owner dishes fetched successfully',
    { dishes },
    getPaginationMeta(total, page, limit)
  );
});

export const createOwnerDish = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const updates = pick(req.body, allowedDishFields);

  if (req.files?.length) {
    updates.images = await Promise.all(
      req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `restaurants/${restaurant._id}/dishes`)))
    );
  }

  const dish = await Dish.create({
    ...updates,
    restaurant: restaurant._id
  });

  sendSuccess(res, StatusCodes.CREATED, 'Dish created successfully', { dish });
});

export const getOwnerDish = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const dish = await Dish.findOne({
    _id: req.params.id,
    restaurant: restaurant._id,
    status: { $ne: 'deleted' }
  });

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  sendSuccess(res, StatusCodes.OK, 'Dish fetched successfully', { dish });
});

export const updateOwnerDish = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const updates = pick(req.body, allowedDishFields);

  if (req.files?.length) {
    updates.images = await Promise.all(
      req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `restaurants/${restaurant._id}/dishes`)))
    );
  }

  const dish = await Dish.findOneAndUpdate(
    { _id: req.params.id, restaurant: restaurant._id, status: { $ne: 'deleted' } },
    updates,
    { new: true, runValidators: true }
  );

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  await recalculateDishRating(dish._id);
  sendSuccess(res, StatusCodes.OK, 'Dish updated successfully', { dish });
});

export const deleteOwnerDish = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const dish = await Dish.findOneAndUpdate(
    { _id: req.params.id, restaurant: restaurant._id, status: { $ne: 'deleted' } },
    { status: 'deleted', deletedAt: new Date() },
    { new: true }
  );

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  await recalculateRestaurantRating(restaurant._id);
  await recalculateDishRating(dish._id);

  sendSuccess(res, StatusCodes.OK, 'Dish deleted successfully');
});

export const listOwnerReviews = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const { page, limit, skip } = getPagination(req.query);
  const filters = { restaurant: restaurant._id, status: { $ne: 'deleted' } };

  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('user', 'name avatar')
      .populate('dish', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Owner reviews fetched successfully',
    { reviews },
    getPaginationMeta(total, page, limit)
  );
});

export const listOwnerViewers = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const { page, limit, skip } = getPagination(req.query);

  const [viewers, total] = await Promise.all([
    RestaurantView.find({ restaurant: restaurant._id })
      .populate('user', 'name avatar email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    RestaurantView.countDocuments({ restaurant: restaurant._id })
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Owner viewers fetched successfully',
    { viewers },
    getPaginationMeta(total, page, limit)
  );
});

export const listOwnerCheckIns = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);
  const { page, limit, skip } = getPagination(req.query);

  const [checkIns, total] = await Promise.all([
    CheckIn.find({ restaurant: restaurant._id })
      .populate('user', 'name avatar email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CheckIn.countDocuments({ restaurant: restaurant._id })
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Owner check-ins fetched successfully',
    { checkIns },
    getPaginationMeta(total, page, limit)
  );
});

export const getOwnerRatingsSummary = catchAsync(async (req, res) => {
  const restaurant = await getOwnerRestaurantOrFail(req.user._id);

  const distribution = await Review.aggregate([
    { $match: { restaurant: restaurant._id, status: 'active' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: -1 } }
  ]);

  const ratings = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: distribution.find((item) => item._id === rating)?.count || 0
  }));

  sendSuccess(res, StatusCodes.OK, 'Ratings summary fetched successfully', {
    average: restaurant.ratingAverage,
    total: restaurant.ratingCount,
    ratings
  });
});
