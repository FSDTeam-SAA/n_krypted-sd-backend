import { z } from 'zod';

export const saveItemSchema = {
  body: z.object({
    itemType: z.enum(['restaurant', 'dish']),
    id: z.string().min(1).optional(),
    restaurantId: z.string().min(1).optional(),
    dishId: z.string().min(1).optional()
  }).refine((value) => value.id || value.restaurantId || value.dishId, {
    message: 'id, restaurantId, or dishId is required'
  })
};

export const deleteSavedItemSchema = {
  params: z.object({
    type: z.enum(['restaurant', 'dish']),
    id: z.string().min(1)
  })
};
