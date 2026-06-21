import { z } from 'zod';
import { idParam, imageAssetSchema, paginationQuery } from './common.validation.js';

export const listReviewsSchema = {
  query: paginationQuery.extend({
    restaurantId: z.string().optional(),
    dishId: z.string().optional(),
    reviewType: z.enum(['customer', 'sd_admin']).optional()
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

export const updateMyReviewSchema = {
  params: idParam,
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().optional(),
    images: z.array(imageAssetSchema).optional()
  })
};

export const reviewIdSchema = {
  params: idParam
};
