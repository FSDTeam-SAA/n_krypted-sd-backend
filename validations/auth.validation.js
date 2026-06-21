import { z } from 'zod';
import { imageAssetSchema, locationSchema, openingHourSchema } from './common.validation.js';

const restaurantSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  location: locationSchema.optional(),
  categories: z.array(z.string()).optional(),
  priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  openingHours: z.array(openingHourSchema).optional()
}).optional();

export const registerSchema = {
  body: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['customer', 'restaurant_owner', 'admin']).optional(),
    phone: z.string().optional(),
    restaurant: restaurantSchema
  })
};

export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  })
};

export const updateMeSchema = {
  body: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    avatar: imageAssetSchema.optional()
  })
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6)
  })
};
