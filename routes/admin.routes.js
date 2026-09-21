import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { restrictTo } from '../middlewares/roles.js';
import {
  createAdminSdReview,
  deleteAdminDish,
  deleteAdminRestaurant,
  deleteAdminReview,
  deleteAdminUser,
  getAdminDashboard,
  getAdminDish,
  getAdminProfile,
  getAdminRestaurant,
  getAdminUser,
  listAdminRestaurants,
  listAdminReviews,
  listAdminUsers,
  overrideCustomerReview,
  updateAdminDishStatus,
  updateAdminPassword,
  updateAdminProfile,
  updateAdminRestaurantStatus,
  updateAdminReview,
  updateAdminReviewStatus,
  updateAdminUserStatus,
  upsertAdminPage
} from '../controllers/admin.controller.js';
import {
  createSdReviewSchema,
  listAdminReviewsSchema,
  listRestaurantsSchema,
  listUsersSchema,
  updateAdminPasswordSchema,
  updateAdminProfileSchema,
  updateAdminReviewSchema,
  updateDishStatusSchema,
  updateRestaurantStatusSchema,
  updateReviewStatusSchema,
  updateUserStatusSchema,
  upsertPageSchema,
  userIdSchema
} from '../validations/admin.validation.js';

const router = Router();

router.use(protect, restrictTo('admin'));

router.get('/dashboard', getAdminDashboard);

router.get('/users', validate(listUsersSchema), listAdminUsers);
router.get('/users/:id', validate(userIdSchema), getAdminUser);
router.patch('/users/:id/status', validate(updateUserStatusSchema), updateAdminUserStatus);
router.delete('/users/:id', validate(userIdSchema), deleteAdminUser);

router.get('/restaurants', validate(listRestaurantsSchema), listAdminRestaurants);
router.get('/restaurants/:id', validate(userIdSchema), getAdminRestaurant);
router.patch('/restaurants/:id/status', validate(updateRestaurantStatusSchema), updateAdminRestaurantStatus);
router.delete('/restaurants/:id', validate(userIdSchema), deleteAdminRestaurant);

router.get('/dishes/:id', validate(userIdSchema), getAdminDish);
router.patch('/dishes/:id/status', validate(updateDishStatusSchema), updateAdminDishStatus);
router.delete('/dishes/:id', validate(userIdSchema), deleteAdminDish);

router.get('/reviews', validate(listAdminReviewsSchema), listAdminReviews);
router.post('/reviews/sd', validate(createSdReviewSchema), createAdminSdReview);
router.patch('/reviews/:id', validate(updateAdminReviewSchema), updateAdminReview);
router.patch('/reviews/:id/override', validate(updateAdminReviewSchema), overrideCustomerReview);
router.patch('/reviews/:id/status', validate(updateReviewStatusSchema), updateAdminReviewStatus);
router.delete('/reviews/:id', validate(userIdSchema), deleteAdminReview);

router.get('/settings/profile', getAdminProfile);
router.patch('/settings/profile', upload.single('avatar'), validate(updateAdminProfileSchema), updateAdminProfile);
router.patch('/settings/password', validate(updateAdminPasswordSchema), updateAdminPassword);

router.patch('/pages/:slug', validate(upsertPageSchema), upsertAdminPage);

export default router;
