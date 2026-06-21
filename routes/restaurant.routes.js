import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { optionalAuth, protect } from '../middlewares/auth.js';
import {
  getRestaurant,
  listNearbyRestaurants,
  listRestaurantDishes,
  listRestaurants
} from '../controllers/restaurant.controller.js';
import { createCheckIn, createRestaurantView } from '../controllers/engagement.controller.js';
import {
  createCheckInSchema,
  nearbyRestaurantsSchema,
  restaurantDishesSchema,
  restaurantIdSchema,
  restaurantListSchema
} from '../validations/restaurant.validation.js';

const router = Router();

router.get('/', validate(restaurantListSchema), listRestaurants);
router.get('/nearby', validate(nearbyRestaurantsSchema), listNearbyRestaurants);
router.get('/:id', validate(restaurantIdSchema), getRestaurant);
router.get('/:id/dishes', validate(restaurantDishesSchema), listRestaurantDishes);
router.post('/:id/check-ins', protect, validate(createCheckInSchema), createCheckIn);
router.post('/:id/views', optionalAuth, validate(restaurantIdSchema), createRestaurantView);

export default router;
