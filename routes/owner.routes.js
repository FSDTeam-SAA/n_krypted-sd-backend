import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { restrictTo } from '../middlewares/roles.js';
import {
  createOwnerDish,
  createOwnerRestaurant,
  deleteOwnerDish,
  deleteRestaurantGalleryImage,
  getOwnerDashboard,
  getOwnerDish,
  getOwnerRatingsSummary,
  getOwnerRestaurant,
  listOwnerCheckIns,
  listOwnerDishes,
  listOwnerReviews,
  listOwnerViewers,
  updateOwnerDish,
  updateOwnerRestaurant,
  uploadRestaurantGallery
} from '../controllers/owner.controller.js';
import {
  createOwnerDishSchema,
  createOwnerRestaurantSchema,
  listOwnerDishesSchema,
  ownerDishIdSchema,
  updateOwnerDishSchema,
  updateOwnerRestaurantSchema
} from '../validations/owner.validation.js';
import { idParam } from '../validations/common.validation.js';

const router = Router();

router.use(protect, restrictTo('restaurant_owner'));

router.get('/dashboard', getOwnerDashboard);
router.post('/restaurant', validate(createOwnerRestaurantSchema), createOwnerRestaurant);
router.get('/restaurant', getOwnerRestaurant);
router.patch('/restaurant', validate(updateOwnerRestaurantSchema), updateOwnerRestaurant);
router.post('/restaurant/gallery', upload.array('images', 10), uploadRestaurantGallery);
router.delete('/restaurant/gallery/:id', validate({ params: idParam }), deleteRestaurantGalleryImage);

router.get('/dishes', validate(listOwnerDishesSchema), listOwnerDishes);
router.post('/dishes', upload.array('images', 10), validate(createOwnerDishSchema), createOwnerDish);
router.get('/dishes/:id', validate(ownerDishIdSchema), getOwnerDish);
router.patch('/dishes/:id', upload.array('images', 10), validate(updateOwnerDishSchema), updateOwnerDish);
router.delete('/dishes/:id', validate(ownerDishIdSchema), deleteOwnerDish);

router.get('/reviews', listOwnerReviews);
router.get('/viewers', listOwnerViewers);
router.get('/check-ins', listOwnerCheckIns);
router.get('/ratings-summary', getOwnerRatingsSummary);

export default router;
