import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import CheckIn from '../models/checkIn.model.js';
import Restaurant from '../models/restaurant.model.js';
import RestaurantView from '../models/restaurantView.model.js';
import { verifyCheckInLocation } from '../utils/checkInLocation.js';

const findActiveRestaurant = async (id) => {
  const restaurant = await Restaurant.findOne({
    _id: id,
    status: 'active',
    deletedAt: { $exists: false }
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  return restaurant;
};

export const createCheckIn = catchAsync(async (req, res) => {
  const restaurant = await findActiveRestaurant(req.params.id);
  const { lat, lng } = req.body;
  const { latitude, longitude, distance } = verifyCheckInLocation(restaurant.location, lat, lng);

  const checkIn = await CheckIn.create({
    user: req.user._id,
    restaurant: restaurant._id,
    location: { type: 'Point', coordinates: [longitude, latitude] },
    distanceMeters: distance
  });

  await Restaurant.findByIdAndUpdate(restaurant._id, { $inc: { checkInCount: 1 } });
  await checkIn.populate('user', 'name avatar');

  sendSuccess(res, StatusCodes.CREATED, 'Check-in created successfully', { checkIn });
});

export const createRestaurantView = catchAsync(async (req, res) => {
  const restaurant = await findActiveRestaurant(req.params.id);

  const view = await RestaurantView.create({
    user: req.user?._id,
    restaurant: restaurant._id,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  await Restaurant.findByIdAndUpdate(restaurant._id, { $inc: { viewCount: 1 } });

  sendSuccess(res, StatusCodes.CREATED, 'Restaurant view recorded successfully', { view });
});
