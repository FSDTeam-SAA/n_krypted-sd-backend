import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import Dish from '../models/dish.model.js';
import Restaurant from '../models/restaurant.model.js';

export const getDish = catchAsync(async (req, res) => {
  const dish = await Dish.findOne({
    _id: req.params.id,
    status: 'active',
    deletedAt: { $exists: false }
  }).populate({
    path: 'restaurant',
    match: { status: 'active', deletedAt: { $exists: false } },
    select: 'name address phone email ratingAverage ratingCount gallery location categories'
  });

  if (!dish || !dish.restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
  }

  const relatedDishes = await Dish.find({
    _id: { $ne: dish._id },
    restaurant: dish.restaurant._id,
    status: 'active',
    deletedAt: { $exists: false }
  }).limit(6);

  sendSuccess(res, StatusCodes.OK, 'Dish details fetched successfully', {
    dish,
    relatedDishes
  });
});
