import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import { getPagination, getPaginationMeta } from '../utils/pagination.js';
import { addSavedFlags } from '../utils/savedFlags.js';
import Restaurant from '../models/restaurant.model.js';
import Dish from '../models/dish.model.js';

const activeRestaurantQuery = { status: 'active', deletedAt: { $exists: false } };
const activeDishQuery = { status: 'active', deletedAt: { $exists: false } };

const buildRestaurantFilters = (query) => {
  const filters = { ...activeRestaurantQuery };

  if (query.category) {
    filters.categories = query.category;
  }

  if (query.priceRange) {
    filters.priceRange = query.priceRange;
  }

  if (query.minRating) {
    filters.ratingAverage = { $gte: Number(query.minRating) };
  }

  if (query.district) {
    filters.address = new RegExp(query.district, 'i');
  }

  if (query.openNow === 'true') {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toTimeString().slice(0, 5);

    filters.openingHours = {
      $elemMatch: {
        day,
        closed: { $ne: true },
        open: { $lte: time },
        close: { $gte: time }
      }
    };
  }

  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filters.$or = [
      { name: regex },
      { address: regex },
      { categories: regex }
    ];
  }

  return filters;
};

const getSort = (sort) => {
  const sorts = {
    rating: { ratingAverage: -1, ratingCount: -1 },
    popular: { viewCount: -1, checkInCount: -1 },
    newest: { createdAt: -1 }
  };

  return sorts[sort] || { ratingAverage: -1, createdAt: -1 };
};

export const listRestaurants = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filters = buildRestaurantFilters(req.query);

  const [restaurantDocs, total] = await Promise.all([
    Restaurant.find(filters)
      .sort(getSort(req.query.sort))
      .skip(skip)
      .limit(limit)
      .populate('owner', 'name email phone avatar'),
    Restaurant.countDocuments(filters)
  ]);
  const { restaurants } = await addSavedFlags(req.user?._id, { restaurants: restaurantDocs });

  sendSuccess(
    res,
    StatusCodes.OK,
    'Restaurants fetched successfully',
    { restaurants },
    getPaginationMeta(total, page, limit)
  );
});

export const listNearbyRestaurants = catchAsync(async (req, res) => {
  const { lat, lng, radius = 5000 } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const match = buildRestaurantFilters(req.query);
  delete match.location;

  const pipeline = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [Number(lng), Number(lat)]
        },
        distanceField: 'distanceMeters',
        maxDistance: Number(radius),
        spherical: true,
        query: match
      }
    }
  ];

  if (req.query.sort === 'rating') {
    pipeline.push({ $sort: { ratingAverage: -1, distanceMeters: 1 } });
  } else if (req.query.sort === 'popular') {
    pipeline.push({ $sort: { viewCount: -1, distanceMeters: 1 } });
  } else {
    pipeline.push({ $sort: { distanceMeters: 1 } });
  }

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      count: [{ $count: 'total' }]
    }
  });

  const [result] = await Restaurant.aggregate(pipeline);
  const restaurantDocs = result?.data || [];
  const total = result?.count?.[0]?.total || 0;
  const { restaurants } = await addSavedFlags(req.user?._id, { restaurants: restaurantDocs });

  sendSuccess(
    res,
    StatusCodes.OK,
    'Nearby restaurants fetched successfully',
    { restaurants },
    getPaginationMeta(total, page, limit)
  );
});

export const getRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    ...activeRestaurantQuery
  }).populate('owner', 'name email phone avatar');

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const [signatureDishDocs, dishDocs] = await Promise.all([
    Dish.find({ restaurant: restaurant._id, isSignature: true, ...activeDishQuery })
      .sort({ ratingAverage: -1 })
      .limit(6),
    Dish.find({ restaurant: restaurant._id, ...activeDishQuery })
      .sort({ isSignature: -1, createdAt: -1 })
      .limit(20)
  ]);
  const saved = await addSavedFlags(req.user?._id, {
    restaurants: [restaurant],
    dishes: [...signatureDishDocs, ...dishDocs]
  });
  const signatureDishes = saved.dishes.slice(0, signatureDishDocs.length);
  const dishes = saved.dishes.slice(signatureDishDocs.length);

  sendSuccess(res, StatusCodes.OK, 'Restaurant details fetched successfully', {
    restaurant: saved.restaurants[0],
    signatureDishes,
    dishes
  });
});

export const listRestaurantDishes = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const restaurant = await Restaurant.exists({ _id: req.params.id, ...activeRestaurantQuery });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const filters = { restaurant: req.params.id, ...activeDishQuery };
  if (req.query.category) filters.category = req.query.category;
  if (req.query.signatureOnly === 'true') filters.isSignature = true;

  const [dishDocs, total] = await Promise.all([
    Dish.find(filters).sort({ isSignature: -1, createdAt: -1 }).skip(skip).limit(limit),
    Dish.countDocuments(filters)
  ]);
  const { dishes } = await addSavedFlags(req.user?._id, { dishes: dishDocs });

  sendSuccess(
    res,
    StatusCodes.OK,
    'Restaurant dishes fetched successfully',
    { dishes },
    getPaginationMeta(total, page, limit)
  );
});

export const listCategories = catchAsync(async (req, res) => {
  const [restaurantCategories, dishCategories] = await Promise.all([
    Restaurant.distinct('categories', activeRestaurantQuery),
    Dish.distinct('category', activeDishQuery)
  ]);

  const all = [...new Set([...restaurantCategories, ...dishCategories].filter(Boolean))].sort();

  sendSuccess(res, StatusCodes.OK, 'Categories fetched successfully', {
    restaurantCategories: restaurantCategories.filter(Boolean).sort(),
    dishCategories: dishCategories.filter(Boolean).sort(),
    all
  });
});
