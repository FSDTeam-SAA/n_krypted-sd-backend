import { z } from 'zod';
import { idParam, paginationQuery } from './common.validation.js';

export const restaurantListSchema = {
  query: paginationQuery.extend({
    search: z.string().optional(),
    category: z.string().optional(),
    priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
    district: z.string().optional(),
    openNow: z.enum(['true', 'false']).optional(),
    minRating: z.coerce.number().min(1).max(5).optional(),
    sort: z.enum(['rating', 'popular', 'newest']).optional()
  })
};

export const nearbyRestaurantsSchema = {
  query: paginationQuery.extend({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().positive().max(100000).optional(),
    search: z.string().optional(),
    category: z.string().optional(),
    priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
    district: z.string().optional(),
    openNow: z.enum(['true', 'false']).optional(),
    minRating: z.coerce.number().min(1).max(5).optional(),
    sort: z.enum(['distance', 'rating', 'popular']).optional()
  })
};

export const restaurantIdSchema = {
  params: idParam
};

export const restaurantDishesSchema = {
  params: idParam,
  query: paginationQuery.extend({
    category: z.string().optional(),
    signatureOnly: z.enum(['true', 'false']).optional()
  })
};

export const createCheckInSchema = {
  params: idParam,
  body: z.object({
    lat: z.preprocess((value) => typeof value === 'string' && value.trim() ? Number(value) : value, z.number().finite().min(-90).max(90)),
    lng: z.preprocess((value) => typeof value === 'string' && value.trim() ? Number(value) : value, z.number().finite().min(-180).max(180))
  })
};
