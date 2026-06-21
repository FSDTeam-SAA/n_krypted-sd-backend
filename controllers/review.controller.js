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

export const listReviews = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = { status: 'active', deletedAt: { $exists: false } };

  if (req.query.restaurantId) filters.restaurant = req.query.restaurantId;
  if (req.query.dishId) filters.dish = req.query.dishId;

  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('user', 'name avatar')
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

  const reviewImages = req.files?.length
    ? await Promise.all(
      req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, `reviews/${req.user._id}`)))
    )
    : images;

  const review = await Review.create({
    user: req.user._id,
    restaurant: restaurantId,
    dish: dishId,
    rating,
    comment,
    images: reviewImages
  });

  await recalculateReviewTargets(review);
  await review.populate('user', 'name avatar');

  sendSuccess(res, StatusCodes.CREATED, 'Review created successfully', { review });
});
