import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import SavedItem from '../models/savedItem.model.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';

const getTarget = async (itemType, id) => {
  if (itemType === 'restaurant') {
    return Restaurant.findOne({ _id: id, status: 'active', deletedAt: { $exists: false } });
  }

  return Dish.findOne({ _id: id, status: 'active', deletedAt: { $exists: false } });
};

export const listSavedItems = catchAsync(async (req, res) => {
  const savedItems = await SavedItem.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path: 'restaurant',
      match: { status: 'active', deletedAt: { $exists: false } },
      select: 'name address gallery ratingAverage ratingCount categories location'
    })
    .populate({
      path: 'dish',
      match: { status: 'active', deletedAt: { $exists: false } },
      select: 'name price images ratingAverage ratingCount restaurant'
    });

  sendSuccess(res, StatusCodes.OK, 'Saved items fetched successfully', {
    savedItems: savedItems.filter((item) => item.restaurant || item.dish)
  });
});

export const saveItem = catchAsync(async (req, res) => {
  const { itemType, id, restaurantId, dishId } = req.body;
  const targetId = id || restaurantId || dishId;
  const target = await getTarget(itemType, targetId);

  if (!target) {
    throw new ApiError(StatusCodes.NOT_FOUND, `${itemType} not found`);
  }

  const query = {
    user: req.user._id,
    itemType,
    ...(itemType === 'restaurant' ? { restaurant: targetId } : { dish: targetId })
  };

  const savedItem = await SavedItem.findOneAndUpdate(
    query,
    { $setOnInsert: query },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate('restaurant', 'name address gallery ratingAverage ratingCount categories location')
    .populate('dish', 'name price images ratingAverage ratingCount restaurant');

  sendSuccess(res, StatusCodes.OK, 'Item saved successfully', { savedItem });
});

export const deleteSavedItem = catchAsync(async (req, res) => {
  const { type, id } = req.params;
  const query = {
    user: req.user._id,
    itemType: type,
    ...(type === 'restaurant' ? { restaurant: id } : { dish: id })
  };

  await SavedItem.deleteOne(query);

  sendSuccess(res, StatusCodes.OK, 'Saved item removed successfully');
});
