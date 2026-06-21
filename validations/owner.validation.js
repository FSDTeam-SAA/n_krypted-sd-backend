import { z } from 'zod';
import { idParam, imageAssetSchema, locationSchema, openingHourSchema, paginationQuery } from './common.validation.js';

const arrayFromForm = (schema) => z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
}, schema);

const objectFromForm = (schema) => z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, schema);

const booleanFromForm = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

const restaurantBody = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  location: locationSchema.optional(),
  categories: arrayFromForm(z.array(z.string()).optional()),
  priceRange: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  openingHours: objectFromForm(z.array(openingHourSchema).optional())
});

const dishBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  category: z.string().optional(),
  images: z.array(imageAssetSchema).optional(),
  ingredients: arrayFromForm(z.array(z.string()).optional()),
  nutrition: objectFromForm(z.object({
    calories: z.coerce.number().optional(),
    protein: z.string().optional(),
    carbs: z.string().optional(),
    fat: z.string().optional(),
    notes: z.string().optional()
  }).optional()),
  preparationMethod: z.string().optional(),
  isSignature: booleanFromForm,
  status: z.enum(['draft', 'active', 'inactive']).optional()
});

export const createOwnerRestaurantSchema = {
  body: restaurantBody.extend({
    name: z.string().min(1)
  })
};

export const updateOwnerRestaurantSchema = {
  body: restaurantBody
};

export const reorderGallerySchema = {
  body: z.object({
    orderedImageIds: z.array(z.string().min(1)).min(1)
  })
};

export const listOwnerDishesSchema = {
  query: paginationQuery.extend({
    category: z.string().optional(),
    search: z.string().optional()
  })
};

export const createOwnerDishSchema = {
  body: dishBody.extend({
    name: z.string().min(1),
    price: z.coerce.number().min(0)
  })
};

export const ownerDishIdSchema = {
  params: idParam
};

export const updateOwnerDishSchema = {
  params: idParam,
  body: dishBody
};
