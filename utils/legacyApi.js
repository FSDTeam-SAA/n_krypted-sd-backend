import { StatusCodes } from 'http-status-codes';
import ApiError from './ApiError.js';
import { streamUpload, toImageAsset } from './cloudinaryUpload.js';
import { externalImageAsset, legacyRestaurant } from './legacySerializers.js';
import Dish from '../models/dish.model.js';

export const sendLegacy = (res, payload = {}, statusCode = StatusCodes.OK, message = 'Success') => {
  res.status(statusCode).json({ success: true, message, ...payload });
};

export const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const parseStringArray = (value) => {
  const parsed = parseJson(value, value);
  if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof parsed === 'string'
    ? parsed.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
};

export const uploadedImages = async (files = [], folder, existing = []) => {
  const retained = parseStringArray(existing).map(externalImageAsset);
  if (!files.length) return retained;
  const added = await Promise.all(
    files.map(async (file) => toImageAsset(await streamUpload(file.buffer, folder)))
  );
  return [...retained, ...added];
};

export const locationFields = (rawLocation) => {
  const location = parseJson(rawLocation, {}) || {};
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  return {
    address: location.address || '',
    city: location.city || '',
    country: location.country || '',
    ...(Number.isFinite(latitude) && Number.isFinite(longitude) && {
      location: { type: 'Point', coordinates: [longitude, latitude] }
    })
  };
};

export const restaurantInput = (body = {}) => ({
  ...(body.title !== undefined && { name: body.title }),
  ...(body.shortDescription !== undefined && { shortDescription: body.shortDescription }),
  ...(body.description !== undefined && { description: body.description }),
  ...(body.price !== undefined && { price: Number(body.price) || 0 }),
  ...(body.category !== undefined && { categories: body.category ? [body.category] : [] }),
  ...(body.offers !== undefined && { offers: parseStringArray(body.offers) }),
  ...(body.opensAt !== undefined && { opensAt: body.opensAt ? new Date(body.opensAt) : undefined }),
  ...(body.reservationRequired !== undefined && {
    reservationRequired: body.reservationRequired === true || body.reservationRequired === 'true'
  }),
  ...locationFields(body.location)
});

export const dishInput = (body = {}) => ({
  ...(body.name !== undefined && { name: body.name }),
  ...(body.description !== undefined && { description: body.description }),
  ...(body.price !== undefined && { price: Number(body.price) || 0 }),
  ...(body.category !== undefined && { category: body.category }),
  ...(body.specialtyDescription !== undefined && { specialtyDescription: body.specialtyDescription }),
  ...(body.ingredients !== undefined && { ingredients: parseStringArray(body.ingredients) }),
  ...(body.preparationProcess !== undefined && { preparationMethod: body.preparationProcess }),
  ...(body.isSignatureDish !== undefined && {
    isSignature: body.isSignatureDish === true || body.isSignatureDish === 'true'
  }),
  ...(body.isActive !== undefined && {
    status: body.isActive === true || body.isActive === 'true' ? 'active' : 'inactive'
  })
});

export const populateLegacyRestaurants = async (restaurants) => {
  const ids = restaurants.map((restaurant) => restaurant._id);
  const dishes = await Dish.find({ restaurant: { $in: ids }, status: { $ne: 'deleted' } });
  const byRestaurant = new Map();
  dishes.forEach((dish) => {
    const key = String(dish.restaurant);
    byRestaurant.set(key, [...(byRestaurant.get(key) || []), dish]);
  });
  return restaurants.map((restaurant) => legacyRestaurant(restaurant, byRestaurant.get(String(restaurant._id)) || []));
};

export const assertOwnerOrAdmin = (user, restaurant) => {
  if (user.role !== 'admin' && String(restaurant.owner) !== String(user._id)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot manage this restaurant');
  }
};
