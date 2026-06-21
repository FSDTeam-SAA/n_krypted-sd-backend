import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { recalculateReviewTargets } from '../utils/recalculateRatings.js';
import Review from '../models/review.model.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import CheckIn from '../models/checkIn.model.js';

export const listReviews = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = { status: 'active', deletedAt: { $exists: false } };

  if (req.query.restaurantId) filters.restaurant = req.query.restaurantId;
  if (req.query.dishId) filters.dish = req.query.dishId;
  if (req.query.reviewType) filters.reviewType = req.query.reviewType;

  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('user', 'name avatar')
      .populate('adminAuthor', 'name avatar')
      .populate('overriddenBy', 'name avatar')
      .populate('restaurant', 'name')
      .populate('dish', 'name images price')
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

export const createReview = catchAsync(async (req, res) => {
  const { restaurantId, dishId, rating, comment, images = [] } = req.body;

  const restaurant = await Restaurant.exists({
    _id: restaurantId,
    status: 'active',
    deletedAt: { $exists: false }
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (dishId) {
    const dish = await Dish.exists({
      _id: dishId,
      restaurant: restaurantId,
      status: 'active',
      deletedAt: { $exists: false }
    });

    if (!dish) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found for this restaurant');
    }
  }

  const hasCheckIn = await CheckIn.exists({
    user: req.user._id,
    restaurant: restaurantId
  });

  if (!hasCheckIn) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Please check in before leaving a review');
  }

  const reviewImages = req.files?.length
    ? await Promise.all(
      req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `reviews/${req.user._id}`)))
    )
    : images;

  const review = await Review.create({
    user: req.user._id,
    restaurant: restaurantId,
    dish: dishId,
    reviewType: 'customer',
    rating,
    comment,
    images: reviewImages
  });

  await recalculateReviewTargets(review);
  await review.populate('user', 'name avatar');

  sendSuccess(res, StatusCodes.CREATED, 'Review created successfully', { review });
});

export const listMyReviews = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = {
    user: req.user._id,
    reviewType: 'customer',
    status: { $ne: 'deleted' }
  };

  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('restaurant', 'name gallery address ratingAverage ratingCount')
      .populate('dish', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filters)
  ]);

  sendSuccess(
    res,
    StatusCodes.OK,
    'My reviews fetched successfully',
    { reviews },
    getPaginationMeta(total, page, limit)
  );
});

export const updateMyReview = catchAsync(async (req, res) => {
  const review = await Review.findOne({
    _id: req.params.id,
    user: req.user._id,
    reviewType: 'customer',
    status: { $ne: 'deleted' }
  });

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  if (req.body.rating !== undefined) review.rating = req.body.rating;
  if (req.body.comment !== undefined) review.comment = req.body.comment;

  if (req.files?.length) {
    review.images = await Promise.all(
      req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `reviews/${req.user._id}`)))
    );
  } else if (req.body.images !== undefined) {
    review.images = req.body.images;
  }

  await review.save();
  await recalculateReviewTargets(review);
  await review.populate('user', 'name avatar');
  await review.populate('restaurant', 'name gallery address');
  await review.populate('dish', 'name images price');

  sendSuccess(res, StatusCodes.OK, 'Review updated successfully', { review });
});

export const deleteMyReview = catchAsync(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    {
      _id: req.params.id,
      user: req.user._id,
      reviewType: 'customer',
      status: { $ne: 'deleted' }
    },
    { status: 'deleted', deletedAt: new Date() },
    { new: true }
  );

  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  }

  await recalculateReviewTargets(review);

  sendSuccess(res, StatusCodes.OK, 'Review deleted successfully');
});
