import { verifyCheckInLocation, validCoordinate } from '../utils/checkInLocation.js';
import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { sendLegacy, populateLegacyRestaurants } from '../utils/legacyApi.js';
import {
  legacyCheckIn,
  legacyMeta,
  legacyRestaurant,
  legacyReview
} from '../utils/legacySerializers.js';
import { getPagination } from '../utils/pagination.js';
import { recalculateReviewTargets } from '../utils/recalculateRatings.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';
import SavedItem from '../models/savedItem.model.js';
import CheckIn from '../models/checkIn.model.js';
import Review from '../models/review.model.js';
import User from '../models/user.model.js';
import StaticPage from '../models/staticPage.model.js';
import CatalogEntry from '../models/catalogEntry.model.js';
import RestaurantView from '../models/restaurantView.model.js';
import { isOpenNow, defaultTags } from '../utils/discovery.js';
import { cleanHtml, validate } from '../utils/content.js';
import { publicReviewVisibility } from '../utils/reviewVisibility.js';
import { z } from 'zod';

const activeRestaurants = { status: 'active', deletedAt: { $exists: false } };
const activeDishes = { status: 'active', deletedAt: { $exists: false } };

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const discoveryQuery = z.object({
  title: z.string().max(300).optional(), search: z.string().max(300).optional(),
  category: z.string().max(120).optional(), cuisine: z.string().max(120).optional(),
  city: z.string().max(120).optional(), country: z.string().max(120).optional(), location: z.string().max(300).optional(),
  minimumRating: z.coerce.number().finite().min(0).max(5).optional(), minRating: z.coerce.number().finite().min(0).max(5).optional(),
  priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(), minPrice: z.coerce.number().finite().min(0).optional(), maxPrice: z.coerce.number().finite().min(0).optional(),
  tags: z.string().max(2000).optional(), recommendation: z.string().max(50).optional(), availability: z.enum(['active', 'upcoming']).optional(),
  openNow: z.enum(['true', 'false']).optional(), sort: z.string().max(30).optional(), radiusKm: z.coerce.number().finite().min(.1).max(100).optional()
}).refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, 'Minimum price must not exceed maximum price');

const restaurantFilters = (query) => {
  const filters = { ...activeRestaurants };
  const search = query.title || query.search;
  if (search) filters.$or = [
    { name: new RegExp(escapeRegex(search), 'i') },
    { description: new RegExp(escapeRegex(search), 'i') },
    { address: new RegExp(escapeRegex(search), 'i') }
  ];
  if (query.category) filters.categories = query.category;
  if (query.cuisine) filters.categories = query.cuisine;
  if (query.minimumRating || query.minRating) {
    filters.ratingAverage = { $gte: Number(query.minimumRating || query.minRating) };
  }
  if (query.city) filters.city = new RegExp(escapeRegex(query.city), 'i');
  if (query.country) filters.country = new RegExp(escapeRegex(query.country), 'i');
  if (query.location) filters.$and = [{ $or: [
    { address: new RegExp(escapeRegex(query.location), 'i') },
    { city: new RegExp(escapeRegex(query.location), 'i') },
    { country: new RegExp(escapeRegex(query.location), 'i') }
  ] }];
  if (query.priceRange) filters.priceRange = query.priceRange;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filters.price = {};
    for (const [key, operator] of [['minPrice', '$gte'], ['maxPrice', '$lte']]) {
      if (query[key] !== undefined) {
        if (!Number.isFinite(Number(query[key])) || Number(query[key]) < 0) throw new ApiError(400, 'Invalid price filter');
        filters.price[operator] = Number(query[key]);
      }
    }
  }
  if (query.availability === 'upcoming') filters.opensAt = { $gt: new Date() };
  if (query.availability === 'active') {
    filters.$and = [...(filters.$and || []), { $or: [{ opensAt: { $exists: false } }, { opensAt: null }, { opensAt: { $lte: new Date() } }] }];
  }
  if (query.recommendation === 'dessert') {
    const dessert = /dessert|cafe|café|coffee|bakery|cake|sweet/i;
    filters.$and = [...(filters.$and || []), { $or: [{ categories: dessert }, { name: dessert }, { description: dessert }] }];
  }
  return filters;
};

const dealSort = (sort) => ({
  rating: { ratingAverage: -1, ratingCount: -1 },
  newest: { createdAt: -1 },
  popular: { checkInCount: -1, viewCount: -1 }
  ,priceAsc: { price: 1 }, priceDesc: { price: -1 }, nearest: { distanceMeters: 1 }
}[sort] || { ratingAverage: -1, createdAt: -1 });

export const legacyListDeals = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = restaurantFilters(validate(discoveryQuery, req.query));
  const hasLocation = req.query.latitude !== undefined || req.query.longitude !== undefined;
  if (hasLocation && (!validCoordinate(req.query.latitude, 90) || !validCoordinate(req.query.longitude, 180))) throw new ApiError(400, 'Invalid coordinates');
  if (req.query.openNow === 'true') {
    const candidates = await Restaurant.find(filters).select('_id openingHours opensAt timeZone').lean();
    filters._id = { $in: candidates.filter((r) => isOpenNow(r)).map((r) => r._id) };
  }
  if (req.query.tags) {
    const ids = await Dish.distinct('restaurant', { ...activeDishes, tags: { $all: String(req.query.tags).split(',') } });
    filters.$and = [...(filters.$and || []), { _id: { $in: ids } }];
  }
  const pipeline = hasLocation ? [{ $geoNear: { near: { type: 'Point', coordinates: [Number(req.query.longitude), Number(req.query.latitude)] }, distanceField: 'distanceMeters', maxDistance: Math.max(.1, Math.min(100, Number(req.query.radiusKm) || 25)) * 1000, spherical: true, query: filters } }] : [{ $match: filters }];
  pipeline.push({ $sort: { ...dealSort(req.query.sort), _id: 1 } }, { $facet: { rows: [{ $skip: skip }, { $limit: limit }], count: [{ $count: 'total' }] } });
  const [result] = await Restaurant.aggregate(pipeline);
  const restaurants = await Restaurant.populate(result.rows, { path: 'owner', select: 'name' });
  const deals = await populateLegacyRestaurants(restaurants);
  deals.forEach((deal, index) => {
    if (hasLocation) deal.distanceKm = result.rows[index].distanceMeters / 1000;
    deal.isOpenNow = isOpenNow(result.rows[index]);
  });
  const total = result.count[0]?.total || 0;
  sendLegacy(res, { deals, pagination: legacyMeta(total, page, limit) });
});

export const legacyGetDeal = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, ...activeRestaurants })
    .populate('owner', 'name email phone avatar country cityState');
  if (!restaurant) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  const [deal] = await populateLegacyRestaurants([restaurant]);
  sendLegacy(res, { deal: { ...deal, isOpenNow: isOpenNow(restaurant) } });
});

export const legacyCategories = catchAsync(async (req, res) => {
  const [restaurantCategories, dishCategories] = await Promise.all([
    Restaurant.distinct('categories', { status: { $ne: 'deleted' } }),
    Dish.distinct('category', { status: { $ne: 'deleted' } })
  ]);
  const data = [...new Set([...restaurantCategories, ...dishCategories].filter(Boolean))]
    .sort()
    .map((name) => ({ _id: name, categoryName: name }));
  sendLegacy(res, { data });
});

export const legacyDiscoveryOptions = catchAsync(async (req, res) => {
  const [cuisines, cities, countries] = await Promise.all([
    Restaurant.distinct('categories', activeRestaurants),
    Restaurant.distinct('city', activeRestaurants),
    Restaurant.distinct('country', activeRestaurants)
  ]);
  const entries = await CatalogEntry.find({});
  const managedNames = (kind) => new Set(entries.filter((e) => e.kind === kind).flatMap((e) => [e.name, ...(e.previousNames || [])]));
  const managedCities = managedNames('city');
  const managedTags = managedNames('tag');
  sendLegacy(res, {
    cuisines: cuisines.filter(Boolean).sort(),
    cities: [...new Set([...cities.filter((name) => !managedCities.has(name)), ...entries.filter((e) => e.kind === 'city' && e.active).map((e) => e.name)])].filter(Boolean).sort(),
    tags: [...new Set([...defaultTags.filter((name) => !managedTags.has(name)), ...entries.filter((e) => e.kind === 'tag' && e.active).map((e) => e.name)])].sort(),
    countries: countries.filter(Boolean).sort(),
    sorts: ['rating', 'priceAsc', 'priceDesc', 'nearest', 'popular', 'newest']
  });
});

export const legacyListSaved = catchAsync(async (req, res) => {
  const saved = await SavedItem.find({ user: req.user._id }).sort({ createdAt: -1 });
  const restaurantIds = saved.filter((item) => item.restaurant).map((item) => item.restaurant);
  const dishIds = saved.filter((item) => item.dish).map((item) => item.dish);
  const savedDishes = await Dish.find({ _id: { $in: dishIds }, ...activeDishes });
  restaurantIds.push(...savedDishes.map((dish) => dish.restaurant));
  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds }, ...activeRestaurants });
  const serialized = await populateLegacyRestaurants(restaurants);
  const restaurantMap = new Map(serialized.map((restaurant) => [restaurant._id, restaurant]));
  const dishMap = new Map(savedDishes.map((dish) => [String(dish._id), dish]));
  const items = saved.map((item) => {
    const dish = item.dish ? dishMap.get(String(item.dish)) : null;
    const restaurantId = String(item.restaurant || dish?.restaurant || '');
    return restaurantMap.has(restaurantId)
      ? { restaurant: restaurantMap.get(restaurantId), dishId: item.dish ? String(item.dish) : null }
      : null;
  }).filter(Boolean);
  sendLegacy(res, { items });
});

export const legacySave = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.restaurantId, ...activeRestaurants });
  if (!restaurant) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  const dishId = req.body.dishId || req.query.dishId;
  let itemType = 'restaurant';
  let target = { restaurant: restaurant._id };
  if (dishId) {
    const dish = await Dish.findOne({ _id: dishId, restaurant: restaurant._id, ...activeDishes });
    if (!dish) throw new ApiError(StatusCodes.NOT_FOUND, 'Dish not found');
    itemType = 'dish';
    target = { dish: dish._id };
  }
  const savedItem = await SavedItem.findOneAndUpdate(
    { user: req.user._id, itemType, ...target },
    { $setOnInsert: { user: req.user._id, itemType, ...target } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  sendLegacy(res, { savedItem });
});

export const legacyUnsave = catchAsync(async (req, res) => {
  const dishId = req.query.dishId || req.body?.dishId;
  const query = { user: req.user._id };
  if (dishId) Object.assign(query, { itemType: 'dish', dish: dishId });
  else Object.assign(query, { itemType: 'restaurant', restaurant: req.params.restaurantId });
  await SavedItem.deleteOne(query);
  sendLegacy(res);
});

export const legacyCreateCheckIn = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.body.restaurantId, ...activeRestaurants });
  if (!restaurant) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  const { latitude, longitude, distance } = verifyCheckInLocation(
    restaurant.location, req.body.latitude, req.body.longitude
  );
  const checkIn = await CheckIn.create({
    user: req.user._id,
    restaurant: restaurant._id,
    ...(Number.isFinite(latitude) && Number.isFinite(longitude) && {
      location: { type: 'Point', coordinates: [longitude, latitude] }
    }),
    accuracy: Number(req.body.accuracy) || 0,
    partySize: Math.max(Number(req.body.partySize) || 1, 1),
    distanceMeters: distance
  });
  await Restaurant.findByIdAndUpdate(restaurant._id, { $inc: { checkInCount: 1 } });
  await checkIn.populate(['user', 'restaurant']);
  sendLegacy(res, { data: legacyCheckIn(checkIn) }, StatusCodes.CREATED, 'Check-in created');
});

const listCheckIns = async (req, filters) => {
  const { page, limit, skip } = getPagination(req.query);
  if (req.query.restaurantId) filters.restaurant = req.query.restaurantId;
  if (req.query.from || req.query.to) {
    filters.createdAt = {};
    if (req.query.from) filters.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filters.createdAt.$lte = new Date(req.query.to);
  }
  const [items, total] = await Promise.all([
    CheckIn.find(filters).populate('user').populate('restaurant').sort({ createdAt: -1 }).skip(skip).limit(limit),
    CheckIn.countDocuments(filters)
  ]);
  const today = await CheckIn.countDocuments({ ...filters, createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } });
  return { data: items.map((item) => legacyCheckIn(item)), meta: legacyMeta(total, page, limit), stats: { total, today } };
};

export const legacyMyCheckIns = catchAsync(async (req, res) => sendLegacy(res, await listCheckIns(req, { user: req.user._id })));

export const legacyOwnerCheckIns = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({ owner: req.user._id, status: { $ne: 'deleted' } });
  if (!restaurant) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  sendLegacy(res, await listCheckIns(req, { restaurant: restaurant._id }));
});

export const legacyAdminCheckIns = catchAsync(async (req, res) => sendLegacy(res, await listCheckIns(req, {})));
export const legacyUserCheckIns = catchAsync(async (req, res) => sendLegacy(res, await listCheckIns(req, { user: req.params.userId })));

const reviewQuery = async (req) => {
  const filters = req.user?.role === 'admin'
    ? { status: { $ne: 'deleted' } }
    : { status: 'active' };
  if (req.query.dealId) filters.restaurant = req.query.dealId;
  if (req.query.userId) filters.user = req.query.userId;
  if (req.query.mine === 'true') {
    if (!req.user) throw new ApiError(401, 'Sign in required');
    filters.user = req.user._id;
    filters.reviewType = 'customer';
    filters.status = { $ne: 'deleted' };
  }
  if (req.user?.role !== 'admin') {
    Object.assign(filters, await publicReviewVisibility());
  }
  return filters;
};

export const legacyListReviews = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = await reviewQuery(req);
  const [reviews, total] = await Promise.all([
    Review.find(filters)
      .populate('user')
      .populate('adminAuthor', 'name')
      .populate('restaurant')
      .populate('dish')
      .populate('checkIn')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filters)
  ]);
  sendLegacy(res, { data: reviews.map(legacyReview), meta: legacyMeta(total, page, limit) });
});

export const legacyReviewsByDeal = catchAsync(async (req, res) => {
  const reviews = await Review.find({ ...await reviewQuery(req), restaurant: req.params.dealId, status: 'active' })
    .populate('user restaurant dish checkIn adminAuthor')
    .sort({ createdAt: -1 });
  sendLegacy(res, { reviews: reviews.map(legacyReview) });
});

export const legacyReviewEligibility = catchAsync(async (req, res) => {
  const checkIn = await CheckIn.findOne({ user: req.user._id, restaurant: req.params.dealId })
    .populate('restaurant')
    .sort({ createdAt: -1 });
  const dishes = checkIn ? await Dish.find({ restaurant: req.params.dealId, ...activeDishes }) : [];
  const checkInData = checkIn ? legacyCheckIn(checkIn, dishes) : null;
  sendLegacy(res, {
    eligible: Boolean(checkIn),
    checkIn: checkInData,
    message: checkIn ? 'You can review this restaurant' : 'Please check in before leaving a review'
  });
});

export const legacyCreateReview = catchAsync(async (req, res) => {
  const restaurantId = req.body.dealID || req.body.restaurantId;
  const checkInId = req.body.checkInID || req.body.checkInId;
  const checkIn = await CheckIn.findOne({ _id: checkInId, user: req.user._id, restaurant: restaurantId });
  if (!checkIn) throw new ApiError(StatusCodes.FORBIDDEN, 'A valid check-in is required');
  if (!await Restaurant.exists({ _id: restaurantId, ...activeRestaurants })) throw new ApiError(404, 'Restaurant not found');
  const dishId = req.body.dishID || req.body.dishId;
  if (dishId && !await Dish.exists({ _id: dishId, restaurant: restaurantId, ...activeDishes })) throw new ApiError(400, 'Dish does not belong to restaurant');
  const review = await Review.create({
    user: req.user._id,
    restaurant: restaurantId,
    dish: dishId || undefined,
    checkIn: checkIn._id,
    rating: Number(req.body.ratings || req.body.rating),
    comment: req.body.reviewComment || req.body.comment || ''
  });
  await recalculateReviewTargets(review);
  await review.populate('user restaurant dish checkIn');
  sendLegacy(res, { review: legacyReview(review) }, StatusCodes.CREATED, 'Review created');
});

export const legacyUpdateReview = catchAsync(async (req, res) => {
  const review = await Review.findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!review) throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  if (req.user.role !== 'admin' && String(review.user) !== String(req.user._id)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot edit this review');
  }
  if (req.user.role === 'admin' && review.reviewType === 'customer') {
    if (!review.originalReview?.rating) review.originalReview = { rating: review.rating, comment: review.comment, images: review.images, status: review.status };
    review.overriddenBy = req.user._id;
    review.overriddenAt = new Date();
  }
  if (req.body.reviewComment !== undefined || req.body.comment !== undefined) review.comment = req.body.reviewComment ?? req.body.comment;
  if (req.body.ratings !== undefined || req.body.rating !== undefined) review.rating = Number(req.body.ratings ?? req.body.rating);
  await review.save();
  await recalculateReviewTargets(review);
  await review.populate('user restaurant dish checkIn');
  sendLegacy(res, { review: legacyReview(review) });
});

export const legacyDeleteReview = catchAsync(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(StatusCodes.NOT_FOUND, 'Review not found');
  if (req.user.role !== 'admin' && String(review.user) !== String(req.user._id)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot delete this review');
  }
  review.status = 'deleted';
  review.deletedAt = new Date();
  await review.save();
  await recalculateReviewTargets(review);
  sendLegacy(res);
});

export const legacyBulkDeleteReviews = catchAsync(async (req, res) => {
  if (!Array.isArray(req.body.ids) || req.body.ids.length > 1000) throw new ApiError(400, 'Provide up to 1000 review IDs');
  const ids = req.body.ids.filter((id) => typeof id === 'string' && mongoose.isValidObjectId(id));
  const reviews = await Review.find({ _id: { $in: ids }, status: { $ne: 'deleted' } }).select('restaurant dish');
  const result = await Review.updateMany(
    { _id: { $in: ids }, status: { $ne: 'deleted' } },
    { status: 'deleted', deletedAt: new Date() }
  );
  const targets = new Map(reviews.map((review) => [`${review.restaurant}:${review.dish || ''}`, review]));
  await Promise.all([...targets.values()].map(recalculateReviewTargets));
  sendLegacy(res, { deletedCount: result.modifiedCount, skippedCount: ids.length - result.modifiedCount });
});

export const legacyReviewRestaurantSummaries = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  let allowedRestaurantIds;
  if (req.user.role === 'restaurant_owner') {
    allowedRestaurantIds = await Restaurant.find({ owner: req.user._id, status: { $ne: 'deleted' } }).distinct('_id');
  }
  const grouped = await Review.aggregate([
    { $match: {
      status: { $ne: 'deleted' },
      ...(allowedRestaurantIds && { restaurant: { $in: allowedRestaurantIds } })
    } },
    { $group: { _id: '$restaurant', totalReviews: { $sum: 1 }, averageRating: { $avg: '$rating' }, latestReviewAt: { $max: '$createdAt' } } },
    { $sort: { latestReviewAt: -1 } },
    { $facet: { data: [{ $skip: skip }, { $limit: limit }], count: [{ $count: 'total' }] } }
  ]);
  const rows = grouped[0]?.data || [];
  const restaurants = await Restaurant.find({ _id: { $in: rows.map((row) => row._id) } });
  const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant._id), legacyRestaurant(restaurant)]));
  const data = rows.map((row) => {
    const restaurant = restaurantMap.get(String(row._id));
    return {
      restaurantId: String(row._id),
      restaurantName: restaurant?.title || '',
      restaurantImages: restaurant?.images || [],
      location: restaurant?.location,
      totalReviews: row.totalReviews,
      averageRating: row.averageRating,
      latestReviewAt: row.latestReviewAt
    };
  });
  const total = grouped[0]?.count?.[0]?.total || 0;
  sendLegacy(res, { data, meta: legacyMeta(total, page, limit) });
});

export const legacyGetLegal = catchAsync(async (req, res) => {
  const pages = await StaticPage.find({ slug: { $in: ['terms', 'privacy', 'impressum'] } });
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  sendLegacy(res, { content: {
    termsHtml: bySlug.get('terms')?.content || '',
    privacyHtml: bySlug.get('privacy')?.content || '',
    impressumHtml: bySlug.get('impressum')?.content || '',
    updatedAt: pages.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.updatedAt || null
  } });
});

export const legacyUpdateLegal = catchAsync(async (req, res) => {
  const operations = [];
  if (req.body.termsHtml !== undefined) operations.push(StaticPage.findOneAndUpdate(
    { slug: 'terms' },
    { title: 'Terms and Conditions', content: cleanHtml(req.body.termsHtml) },
    { upsert: true, new: true, runValidators: true }
  ));
  if (req.body.privacyHtml !== undefined) operations.push(StaticPage.findOneAndUpdate(
    { slug: 'privacy' },
    { title: 'Privacy Policy', content: cleanHtml(req.body.privacyHtml) },
    { upsert: true, new: true, runValidators: true }
  ));
  if (req.body.impressumHtml !== undefined) operations.push(StaticPage.findOneAndUpdate({ slug: 'impressum' }, { title: 'Impressum', content: cleanHtml(req.body.impressumHtml) }, { upsert: true, new: true, runValidators: true }));
  await Promise.all(operations);
  const pages = await StaticPage.find({ slug: { $in: ['terms', 'privacy', 'impressum'] } });
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  sendLegacy(res, { content: {
    termsHtml: bySlug.get('terms')?.content || '',
    privacyHtml: bySlug.get('privacy')?.content || '',
    impressumHtml: bySlug.get('impressum')?.content || '',
    updatedAt: new Date()
  } });
});

export const legacyDashboardStats = catchAsync(async (req, res) => {
  const restaurantFilter = req.user.role === 'restaurant_owner'
    ? { owner: req.user._id, status: { $ne: 'deleted' } }
    : { status: { $ne: 'deleted' } };
  const restaurants = await Restaurant.find(restaurantFilter).select('_id status');
  const restaurantIds = restaurants.map((restaurant) => restaurant._id);
  const totalViews = await RestaurantView.countDocuments({ restaurant: { $in: restaurantIds } });
  const reviewFilter = req.user.role === 'restaurant_owner' ? { restaurant: { $in: restaurantIds }, status: { $ne: 'deleted' } } : { status: { $ne: 'deleted' } };
  const checkInFilter = req.user.role === 'restaurant_owner' ? { restaurant: { $in: restaurantIds } } : {};
  const [totalCustomers, totalReviews, totalCheckIns, customerGrowth] = await Promise.all([
    req.user.role === 'admin' ? User.countDocuments({ role: 'customer', status: { $ne: 'deleted' } }) : User.countDocuments({ _id: { $in: await CheckIn.distinct('user', checkInFilter) } }),
    Review.countDocuments(reviewFilter),
    CheckIn.countDocuments(checkInFilter),
    req.user.role === 'admin' ? User.aggregate([
      { $match: { role: 'customer', status: { $ne: 'deleted' } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, users: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]) : []
  ]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  sendLegacy(res, { data: {
    totalCustomers,
    totalViews,
    totalDeals: restaurants.length,
    totalReviews,
    totalCheckIns,
    activeDeals: restaurants.filter((restaurant) => restaurant.status === 'active').length,
    userGrowthData: customerGrowth.map((row) => ({ month: `${months[row._id.month - 1]} ${row._id.year}`, users: row.users })),
    restaurantWeeklyData: []
  } });
});
