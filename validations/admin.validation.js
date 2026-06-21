import { z } from 'zod';
import { idParam, imageAssetSchema, paginationQuery, slugParam } from './common.validation.js';

export const listUsersSchema = {
  query: paginationQuery.extend({
    search: z.string().optional(),
    role: z.enum(['customer', 'restaurant_owner', 'admin']).optional(),
    status: z.enum(['active', 'pending', 'blocked', 'deleted']).optional()
  })
};

export const userIdSchema = {
  params: idParam
};

export const updateUserStatusSchema = {
  params: idParam,
  body: z.object({
    status: z.enum(['active', 'pending', 'blocked', 'deleted'])
  })
};

export const listRestaurantsSchema = {
  query: paginationQuery.extend({
    search: z.string().optional(),
    category: z.string().optional(),
    priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
    district: z.string().optional(),
    status: z.enum(['pending', 'active', 'inactive', 'blocked', 'deleted']).optional()
  })
};

export const updateRestaurantStatusSchema = {
  params: idParam,
  body: z.object({
    status: z.enum(['pending', 'active', 'inactive', 'blocked', 'deleted'])
  })
};

export const updateDishStatusSchema = {
  params: idParam,
  body: z.object({
    status: z.enum(['draft', 'active', 'inactive', 'deleted'])
  })
};

export const listAdminReviewsSchema = {
  query: paginationQuery.extend({
    status: z.enum(['active', 'hidden', 'deleted']).optional(),
    reviewType: z.enum(['customer', 'sd_admin']).optional(),
    restaurantId: z.string().optional(),
    dishId: z.string().optional()
  })
};

export const createSdReviewSchema = {
  body: z.object({
    restaurantId: z.string().min(1),
    dishId: z.string().min(1).optional(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().optional(),
    images: z.array(imageAssetSchema).optional(),
    status: z.enum(['active', 'hidden']).optional()
  })
};

export const updateAdminReviewSchema = {
  params: idParam,
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().optional(),
    images: z.array(imageAssetSchema).optional(),
    status: z.enum(['active', 'hidden', 'deleted']).optional(),
    overrideReason: z.string().optional()
  })
};

export const updateReviewStatusSchema = {
  params: idParam,
  body: z.object({
    status: z.enum(['active', 'hidden', 'deleted'])
  })
};

export const updateAdminProfileSchema = {
  body: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    avatar: imageAssetSchema.optional()
  })
};

export const updateAdminPasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6)
  })
};

export const upsertPageSchema = {
  params: slugParam,
  body: z.object({
    title: z.string().min(1),
    content: z.string().min(1)
  })
};
