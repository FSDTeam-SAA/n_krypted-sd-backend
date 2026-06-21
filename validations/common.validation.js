import { z } from 'zod';

export const idParam = z.object({
  id: z.string().min(1)
});

export const slugParam = z.object({
  slug: z.enum(['terms', 'privacy'])
});

export const imageAssetSchema = z.object({
  public_id: z.string().min(1),
  secure_url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
  format: z.string().optional(),
  bytes: z.number().optional(),
  alt: z.string().optional()
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
}).passthrough();

export const locationSchema = z.object({
  type: z.literal('Point').default('Point'),
  coordinates: z.tuple([z.number(), z.number()])
});

export const openingHourSchema = z.object({
  day: z.string(),
  open: z.string().optional(),
  close: z.string().optional(),
  closed: z.boolean().optional()
});
