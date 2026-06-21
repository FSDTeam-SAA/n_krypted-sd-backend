import { z } from 'zod';
import { imageAssetSchema, paginationQuery } from './common.validation.js';

export const listReviewsSchema = {
  query: paginationQuery.extend({
    restaurantId: z.string().optional(),
    dishId: z.string().optional()
  })
};

export const createReviewSchema = {
  body: z.object({
    restaurantId: z.string().min(1),
    dishId: z.string().min(1).optional(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().optional(),
    images: z.array(imageAssetSchema).optional()
  })
};
