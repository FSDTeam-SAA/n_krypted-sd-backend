import { Router } from 'express';
import upload from '../middlewares/upload.js';
import { protect, optionalAuth } from '../middlewares/auth.js';
import { restrictTo } from '../middlewares/roles.js';
import { deleteAccountCascade } from '../utils/accountDeletion.js';
import catchAsync from '../utils/catchAsync.js';
import { sendLegacy } from '../utils/legacyApi.js';
import {
  legacyBulkDeleteUsers,
  legacyChangePassword,
  legacyCreateOwner,
  legacyForgotPassword,
  legacyGetUser,
  legacyListOwners,
  legacyListUsers,
  legacyLogin,
  legacyRegister,
  legacyResetPassword,
  legacyUpdateOwner,
  legacyUpdateProfile,
  legacyVerify
} from '../controllers/legacyAuth.controller.js';
import {
  legacyAdminCheckIns,
  legacyAppSettings,
  legacyBulkDeleteReviews,
  legacyCategories,
  legacyCreateCheckIn,
  legacyCreateReview,
  legacyDashboardStats,
  legacyDeleteReview,
  legacyDiscoveryOptions,
  legacyGetDeal,
  legacyGetLegal,
  legacyListDeals,
  legacyListReviews,
  legacyListSaved,
  legacyMyCheckIns,
  legacyOwnerCheckIns,
  legacyReviewEligibility,
  legacyReviewRestaurantSummaries,
  legacyReviewsByDeal,
  legacySave,
  legacyUnsave,
  legacyUpdateLegal,
  legacyUpdateReview,
  legacyUserCheckIns
} from '../controllers/legacyCatalog.controller.js';
import {
  legacyAddDish,
  legacyApproval,
  legacyBulkDeleteRestaurants,
  legacyCreateAdminRestaurant,
  legacyCreateOwnerRestaurant,
  legacyDeleteDish,
  legacyGetOwnerRestaurant,
  legacyManageRestaurant,
  legacyManageRestaurants,
  legacyResubmitOwnerRestaurant,
  legacyToggleRestaurant,
  legacyUpdateDish,
  legacyUpdateRestaurant
} from '../controllers/legacyManagement.controller.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.post('/auth/register', legacyRegister);
router.post('/auth/login', legacyLogin);
router.post('/auth/forgot-password', legacyForgotPassword);
router.post('/auth/verify', legacyVerify);
router.post('/auth/reset-password', legacyResetPassword);
router.post('/auth/change-password', protect, legacyChangePassword);
router.put('/auth/update-profile', protect, upload.single('avatar'), legacyUpdateProfile);
router.get('/auth/single-user/:id', protect, legacyGetUser);
router.delete('/auth/delete/user', protect, catchAsync(async (req, res) => {
  await deleteAccountCascade(req.user._id);
  sendLegacy(res);
}));

router.get('/auth/all/user', ...adminOnly, legacyListUsers);
router.delete('/auth/delete/users', ...adminOnly, legacyBulkDeleteUsers);
router.get('/auth/restaurant-owners', ...adminOnly, legacyListOwners);
router.post('/auth/restaurant-owners', ...adminOnly, legacyCreateOwner);
router.put('/auth/restaurant-owners/:id', ...adminOnly, legacyUpdateOwner);

router.get('/deals', optionalAuth, legacyListDeals);
router.get('/deals/:id', optionalAuth, legacyGetDeal);
router.patch('/deals/:id/status', ...adminOnly, legacyToggleRestaurant);
router.delete('/deals/bulk', ...adminOnly, legacyBulkDeleteRestaurants);
router.get('/categories', legacyCategories);
router.get('/discovery/options', legacyDiscoveryOptions);

router.get('/saved', protect, legacyListSaved);
router.put('/saved/:restaurantId', protect, legacySave);
router.delete('/saved/:restaurantId', protect, legacyUnsave);

router.post('/check-ins', protect, legacyCreateCheckIn);
router.get('/check-ins/my', protect, legacyMyCheckIns);
router.get('/check-ins/owner', protect, restrictTo('restaurant_owner'), legacyOwnerCheckIns);
router.get('/check-ins/admin', ...adminOnly, legacyAdminCheckIns);
router.get('/check-ins/user/:userId', ...adminOnly, legacyUserCheckIns);

router.get('/reviews/deal/:dealId', legacyReviewsByDeal);
router.get('/reviews/eligibility/:dealId', protect, legacyReviewEligibility);
router.get('/reviews', optionalAuth, legacyListReviews);
router.post('/reviews', protect, legacyCreateReview);
router.put('/reviews/:id', protect, legacyUpdateReview);
router.delete('/reviews/bulk', ...adminOnly, legacyBulkDeleteReviews);
router.delete('/reviews/:id', protect, legacyDeleteReview);
router.get('/review-restaurants', protect, restrictTo('admin', 'restaurant_owner'), legacyReviewRestaurantSummaries);

router.get('/content/legal', legacyGetLegal);
router.put('/content/legal', ...adminOnly, legacyUpdateLegal);
router.get('/content/app-settings', legacyAppSettings);
router.get('/dashboard/stats', protect, restrictTo('admin', 'restaurant_owner'), legacyDashboardStats);

router.get('/manage/deals', protect, restrictTo('admin', 'restaurant_owner'), legacyManageRestaurants);
router.get('/manage/deals/:id', protect, restrictTo('admin', 'restaurant_owner'), legacyManageRestaurant);
router.get('/owner/restaurant', protect, restrictTo('restaurant_owner'), legacyGetOwnerRestaurant);
router.post('/owner/restaurant', protect, restrictTo('restaurant_owner'), upload.array('images', 10), legacyCreateOwnerRestaurant);
router.put('/owner/restaurant/:id', protect, restrictTo('restaurant_owner'), upload.array('images', 10), legacyResubmitOwnerRestaurant);

router.post('/admin/restaurants', ...adminOnly, upload.array('images', 10), legacyCreateAdminRestaurant);
router.put('/admin/restaurants/:id', protect, upload.array('images', 10), legacyUpdateRestaurant);
router.patch('/admin/restaurants/:id/approval', ...adminOnly, legacyApproval);

router.post('/restaurants/:id/dishes', protect, upload.array('images', 10), legacyAddDish);
router.put('/restaurants/:id/dishes/:dishId', protect, upload.array('images', 10), legacyUpdateDish);
router.delete('/restaurants/:id/dishes/:dishId', protect, legacyDeleteDish);

export default router;
