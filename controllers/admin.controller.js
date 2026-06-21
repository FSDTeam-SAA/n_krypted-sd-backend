import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { deleteAccountCascade } from '../utils/accountDeletion.js';
import { streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import {
  recalculateDishRating,
  recalculateRestaurantRating,
  recalculateReviewTargets
} from '../utils/recalculateRatings.js';
import User from '../models/user.model.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import Review from '../models/review.model.js';
import SavedItem from '../models/savedItem.model.js';
import CheckIn from '../models/checkIn.model.js';
import RestaurantView from '../models/restaurantView.model.js';
import StaticPage from '../models/staticPage.model.js';

const buildSearch = (fields, search) => {
  if (!search) return {};
  const regex = new RegExp(search, 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const monthlyCount = async (Model, match = {}) => {
  return Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
};

const validateReviewTarget = async ({ restaurantId, dishId, allowInactive = true }) => {
  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    status: allowInactive ? { $ne: 'deleted' } : 'active'
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (dishId) {
    const dish = await Dish.findOne({
      _id: dishId,
      restaurant: restaurant._id,
      status: allowInactive ? { $ne: 'deleted' } : 'active'
    });

    if (!dish) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found for this restaurant');
    }
  }

  return restaurant;
};

const applyAdminReviewChanges = async (review, body, adminUserId, { requireCustomerOverride = false } = {}) => {
  if (requireCustomerOverride && review.reviewType !== 'customer') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Only customer reviews can be overridden');
  }

  const isCustomerOverride = review.reviewType === 'customer';

  if (isCustomerOverride && !review.originalReview?.rating) {
    review.originalReview = {
      rating: review.rating,
      comment: review.comment,
      images: review.images,
      status: review.status
    };
  }

  if (body.rating !== undefined) review.rating = body.rating;
  if (body.comment !== undefined) review.comment = body.comment;
  if (body.images !== undefined) review.images = body.images;
  if (body.status !== undefined) {
    review.status = body.status;
    review.deletedAt = body.status === 'deleted' ? new Date() : undefined;
  }

  if (isCustomerOverride) {
    review.overriddenBy = adminUserId;
    review.overriddenAt = new Date();
    review.overrideReason = body.overrideReason;
  }

  await review.save();
  await recalculateReviewTargets(review);
  await review.populate('user', 'name email avatar');
  await review.populate('adminAuthor', 'name email avatar');
  await review.populate('overriddenBy', 'name email avatar');
  await review.populate('restaurant', 'name gallery');
  await review.populate('dish', 'name images');

  return review;
};

export const getAdminDashboard = catchAsync(async (req, res) => {
  const [
    totalUsers,
    totalRestaurants,
    activeRestaurants,
    totalDishes,
    totalReviews,
    totalViews,
    totalCheckIns,
    userChart,
    restaurantChart,
    topReviews,
    recentRestaurants
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: 'deleted' } }),
    Restaurant.countDocuments({ status: { $ne: 'deleted' } }),
    Restaurant.countDocuments({ status: 'active' }),
    Dish.countDocuments({ status: { $ne: 'deleted' } }),
    Review.countDocuments({ status: { $ne: 'deleted' } }),
    RestaurantView.countDocuments(),
    CheckIn.countDocuments(),
    monthlyCount(User, { status: { $ne: 'deleted' } }),
    monthlyCount(Restaurant, { status: { $ne: 'deleted' } }),
    Review.find({ status: 'active' })
      .populate('user', 'name avatar')
      .populate('restaurant', 'name gallery')
      .populate('dish', 'name images')
      .sort({ rating: -1, createdAt: -1 })
      .limit(5),
    Restaurant.find({ status: { $ne: 'deleted' } })
      .populate('owner', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(5)
  ]);

  sendSuccess(res, StatusCodes.OK, 'Admin dashboard fetched successfully', {
    totals: {
      users: totalUsers,
      restaurants: totalRestaurants,
      activeRestaurants,
      activeRestaurantPercentage: totalRestaurants ? Math.round((activeRestaurants / totalRestaurants) * 100) : 0,
      dishes: totalDishes,
      reviews: totalReviews,
      views: totalViews,
      checkIns: totalCheckIns
    },
    charts: {
      users: userChart,
      restaurants: restaurantChart
    },
    topReviews,
    recentRestaurants
  });
});

export const listAdminUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = {
    status: { $ne: 'deleted' },
    ...buildSearch(['name', 'email', 'phone'], req.query.search)
  };

  if (req.query.role) filters.role = req.query.role;
  if (req.query.status) filters.status = req.query.status;

  const [users, total] = await Promise.all([
    User.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Users fetched successfully',
    { users },
    getPaginationMeta(total, page, limit)
  );
});

export const getAdminUser = catchAsync(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const [restaurants, reviews, checkIns] = await Promise.all([
    Restaurant.find({ owner: user._id, status: { $ne: 'deleted' } }),
    Review.find({ user: user._id, status: { $ne: 'deleted' } }).populate('restaurant', 'name').limit(10),
    CheckIn.find({ user: user._id }).populate('restaurant', 'name').limit(10)
  ]);

  sendSuccess(res, StatusCodes.OK, 'User details fetched successfully', {
    user,
    restaurants,
    reviews,
    checkIns
  });
});

export const updateAdminUserStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  if (status === 'deleted') {
    const user = await deleteAccountCascade(req.params.id);

    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
    }

    sendSuccess(res, StatusCodes.OK, 'User status updated successfully', { user });
    return;
  }

  const update = status === 'deleted'
    ? { $set: { status, deletedAt: new Date() } }
    : { $set: { status }, $unset: { deletedAt: '' } };

  const user = await User.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  sendSuccess(res, StatusCodes.OK, 'User status updated successfully', { user });
});

export const deleteAdminUser = catchAsync(async (req, res) => {
  const user = await deleteAccountCascade(req.params.id);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  sendSuccess(res, StatusCodes.OK, 'User deleted successfully');
});

export const listAdminRestaurants = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = {
    status: { $ne: 'deleted' },
    ...buildSearch(['name', 'email', 'phone', 'address'], req.query.search)
  };

  if (req.query.status) filters.status = req.query.status;
  if (req.query.category) filters.categories = req.query.category;
  if (req.query.priceRange) filters.priceRange = req.query.priceRange;
  if (req.query.district) filters.address = new RegExp(req.query.district, 'i');

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filters)
      .populate('owner', 'name email phone avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Restaurant.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Restaurants fetched successfully',
    { restaurants },
    getPaginationMeta(total, page, limit)
  );
});

export const getAdminRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, status: { $ne: 'deleted' } })
    .populate('owner', 'name email phone avatar');

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const [dishes, reviews, viewers, checkIns] = await Promise.all([
    Dish.find({ restaurant: restaurant._id, status: { $ne: 'deleted' } }).limit(50),
    Review.find({ restaurant: restaurant._id, status: { $ne: 'deleted' } })
      .populate('user', 'name avatar')
      .populate('dish', 'name images')
      .sort({ createdAt: -1 })
      .limit(20),
    RestaurantView.countDocuments({ restaurant: restaurant._id }),
    CheckIn.countDocuments({ restaurant: restaurant._id })
  ]);

  sendSuccess(res, StatusCodes.OK, 'Restaurant details fetched successfully', {
    restaurant,
    dishes,
    reviews,
    stats: { viewers, checkIns }
  });
});

export const updateAdminRestaurantStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const update = status === 'deleted'
    ? { $set: { status, deletedAt: new Date() } }
    : { $set: { status }, $unset: { deletedAt: '' } };

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  );

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (status === 'deleted') {
    await Dish.updateMany(
      { restaurant: restaurant._id, status: { $ne: 'deleted' } },
      { status: 'deleted', deletedAt: new Date() }
    );
  }

  sendSuccess(res, StatusCodes.OK, 'Restaurant status updated successfully', { restaurant });
});

export const deleteAdminRestaurant = catchAsync(async (req, res) => {
  const deletedAt = new Date();
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { status: 'deleted', deletedAt },
    { new: true }
  );

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  await Dish.updateMany(
    { restaurant: restaurant._id, status: { $ne: 'deleted' } },
    { status: 'deleted', deletedAt }
  );

  sendSuccess(res, StatusCodes.OK, 'Restaurant deleted successfully');
});

export const getAdminDish = catchAsync(async (req, res) => {
  const dish = await Dish.findOne({
    _id: req.params.id,
    status: { $ne: 'deleted' }
  }).populate({
    path: 'restaurant',
    select: 'name owner address phone email ratingAverage ratingCount status',
    populate: { path: 'owner', select: 'name email phone avatar' }
  });

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  const reviews = await Review.find({
    dish: dish._id,
    status: { $ne: 'deleted' }
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(20);

  sendSuccess(res, StatusCodes.OK, 'Dish details fetched successfully', {
    dish,
    reviews
  });
});

export const updateAdminDishStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const update = status === 'deleted'
    ? { $set: { status, deletedAt: new Date() } }
    : { $set: { status }, $unset: { deletedAt: '' } };

  const dish = await Dish.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true
  });

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  if (status === 'deleted') {
    await Promise.all([
      Review.updateMany(
        { dish: dish._id, status: { $ne: 'deleted' } },
        { status: 'deleted', deletedAt: new Date() }
      ),
      SavedItem.deleteMany({ dish: dish._id })
    ]);
  }

  await recalculateRestaurantRating(dish.restaurant);
  await recalculateDishRating(dish._id);

  sendSuccess(res, StatusCodes.OK, 'Dish status updated successfully', { dish });
});

export const deleteAdminDish = catchAsync(async (req, res) => {
  const deletedAt = new Date();
  const dish = await Dish.findByIdAndUpdate(
    req.params.id,
    { status: 'deleted', deletedAt },
    { new: true }
  );

  if (!dish) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  await Promise.all([
    Review.updateMany(
      { dish: dish._id, status: { $ne: 'deleted' } },
      { status: 'deleted', deletedAt }
    ),
    SavedItem.deleteMany({ dish: dish._id })
  ]);

  await recalculateRestaurantRating(dish.restaurant);
  await recalculateDishRating(dish._id);

  sendSuccess(res, StatusCodes.OK, 'Dish deleted successfully');
});

export const listAdminReviews = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = {};

  if (req.query.status) filters.status = req.query.status;
  else filters.status = { $ne: 'deleted' };
  if (req.query.restaurantId) filters.restaurant = req.query.restaurantId;
  if (req.query.dishId) filters.dish = req.query.dishId;
  if (req.query.reviewType) filters.reviewType = req.query.reviewType;

  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('user', 'name email avatar')
      .populate('adminAuthor', 'name email avatar')
      .populate('overriddenBy', 'name email avatar')
      .populate('restaurant', 'name gallery')
      .populate('dish', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'Reviews fetched successfully',
    { reviews },
    getPaginationMeta(total, page, limit)
  );
});

export const createAdminSdReview = catchAsync(async (req, res) => {
  const { restaurantId, dishId, rating, comment, images = [], status = 'active' } = req.body;

  await validateReviewTarget({ restaurantId, dishId });

  const review = await Review.create({
    adminAuthor: req.user._id,
    reviewType: 'sd_admin',
    restaurant: restaurantId,
    dish: dishId,
    rating,
    comment,
    images,
    status
  });

  await review.populate('adminAuthor', 'name email avatar');
  await review.populate('restaurant', 'name gallery');
  await review.populate('dish', 'name images');

  sendSuccess(res, StatusCodes.CREATED, 'SD review created successfully', { review });
});

export const updateAdminReview = catchAsync(async (req, res) => {
  const review = await Review.findOne({
    _id: req.params.id,
    status: { $ne: 'deleted' }
  });

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  const updatedReview = await applyAdminReviewChanges(review, req.body, req.user._id);

  sendSuccess(res, StatusCodes.OK, 'Review updated successfully', { review: updatedReview });
});

export const overrideCustomerReview = catchAsync(async (req, res) => {
  const review = await Review.findOne({
    _id: req.params.id,
    reviewType: 'customer',
    status: { $ne: 'deleted' }
  });

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  const updatedReview = await applyAdminReviewChanges(review, req.body, req.user._id, {
    requireCustomerOverride: true
  });

  sendSuccess(res, StatusCodes.OK, 'Customer review overridden successfully', { review: updatedReview });
});

export const updateAdminReviewStatus = catchAsync(async (req, res) => {
  const update = req.body.status === 'deleted'
    ? { $set: { status: req.body.status, deletedAt: new Date() } }
    : { $set: { status: req.body.status }, $unset: { deletedAt: '' } };

  const review = await Review.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  );

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  await recalculateReviewTargets(review);

  sendSuccess(res, StatusCodes.OK, 'Review status updated successfully', { review });
});

export const deleteAdminReview = catchAsync(async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status: 'deleted', deletedAt: new Date() },
    { new: true }
  );

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  await recalculateReviewTargets(review);

  sendSuccess(res, StatusCodes.OK, 'Review deleted successfully');
});

export const getAdminProfile = catchAsync(async (req, res) => {
  sendSuccess(res, StatusCodes.OK, 'Admin profile fetched successfully', { user: req.user });
});

export const updateAdminProfile = catchAsync(async (req, res) => {
  const updates = {};
  ['name', 'phone', 'avatar'].forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (req.file) {
    updates.avatar = toImageAsset(await streamUpload(req.file.buffer, `users/${req.user._id}`));
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  });

  sendSuccess(res, StatusCodes.OK, 'Admin profile updated successfully', { user });
});

export const updateAdminPassword = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();

  sendSuccess(res, StatusCodes.OK, 'Admin password updated successfully');
});

export const upsertAdminPage = catchAsync(async (req, res) => {
  const page = await StaticPage.findOneAndUpdate(
    { slug: req.params.slug },
    {
      slug: req.params.slug,
      title: req.body.title,
      content: req.body.content
    },
    { upsert: true, new: true, runValidators: true }
  );

  sendSuccess(res, StatusCodes.OK, 'Static page saved successfully', { page });
});
