import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { restrictTo } from '../middlewares/roles.js';
import {
  deleteAdminRestaurant,
  deleteAdminReview,
  deleteAdminUser,
  getAdminDashboard,
  getAdminProfile,
  getAdminRestaurant,
  getAdminUser,
  listAdminRestaurants,
  listAdminReviews,
  listAdminUsers,
  updateAdminPassword,
  updateAdminProfile,
  updateAdminRestaurantStatus,
  updateAdminReviewStatus,
  updateAdminUserStatus,
  upsertAdminPage
} from '../controllers/admin.controller.js';
import {
  listAdminReviewsSchema,
  listRestaurantsSchema,
  listUsersSchema,
  updateAdminPasswordSchema,
  updateAdminProfileSchema,
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

router.get('/reviews', validate(listAdminReviewsSchema), listAdminReviews);
router.patch('/reviews/:id/status', validate(updateReviewStatusSchema), updateAdminReviewStatus);
router.delete('/reviews/:id', validate(userIdSchema), deleteAdminReview);

router.get('/settings/profile', getAdminProfile);
router.patch('/settings/profile', upload.single('avatar'), validate(updateAdminProfileSchema), updateAdminProfile);
router.patch('/settings/password', validate(updateAdminPasswordSchema), updateAdminPassword);

router.patch('/pages/:slug', validate(upsertPageSchema), upsertAdminPage);

export default router;
