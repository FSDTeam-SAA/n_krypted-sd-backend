import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let app;
let mongoServer;
let adminToken;
let ownerToken;
let customerToken;
let customerRefreshToken;
let ownerId;
let customerId;
let restaurantId;
let dishId;
let reviewId;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '1d';
  process.env.NODE_ENV = 'test';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ default: app } = await import('../app.js'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('n_krypted MVP API', () => {
  it('returns German primary messages with English companion messages', async () => {
    const health = await request(app).get('/');

    expect(health.status).toBe(200);
    expect(health.body.message).toBe('n_krypted API läuft');
    expect(health.body.messageEn).toBe('n_krypted API is running');
  });

  it('registers and signs in admin, owner, and customer accounts without signup OTP', async () => {
    const admin = await request(app).post('/api/v1/auth/register').send({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin'
    });

    expect(admin.status).toBe(201);
    expect(admin.body.messageEn).toBe('Registration successful');
    expect(admin.body.data.user.emailVerified).toBe(true);
    expect(admin.body.data.accessToken).toBeTruthy();
    expect(admin.body.data.refreshToken).toBeTruthy();
    adminToken = admin.body.data.accessToken;

    const owner = await request(app).post('/api/v1/auth/register').send({
      name: 'Owner User',
      email: 'owner@example.com',
      password: 'password123',
      role: 'restaurant_owner',
      restaurant: {
        name: 'Restaurant JAN',
        email: 'restaurant@example.com',
        phone: '+8801700000000',
        address: 'Munich, Germany',
        description: 'Modern German food',
        categories: ['German', 'Popular'],
        priceRange: '$$',
        location: {
          type: 'Point',
          coordinates: [90.4125, 23.8103]
        }
      }
    });

    expect(owner.status).toBe(201);
    ownerId = owner.body.data.user._id;
    restaurantId = owner.body.data.restaurant._id;
    expect(owner.body.data.restaurant.status).toBe('pending');
    expect(owner.body.data.user.emailVerified).toBe(true);
    ownerToken = owner.body.data.accessToken;

    const customer = await request(app).post('/api/v1/auth/register').send({
      name: 'Customer User',
      email: 'customer@example.com',
      password: 'password123',
      role: 'customer'
    });

    expect(customer.status).toBe(201);
    customerId = customer.body.data.user._id;
    expect(customer.body.data.user.emailVerified).toBe(true);
    customerToken = customer.body.data.accessToken;
    customerRefreshToken = customer.body.data.refreshToken;
  });

  it('refreshes access tokens and supports forgot-password OTP reset', async () => {
    const refresh = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: customerRefreshToken
    });

    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toBeTruthy();
    expect(refresh.body.data.refreshToken).toBeTruthy();
    customerToken = refresh.body.data.accessToken;

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'customer@example.com'
    });

    expect(forgot.status).toBe(200);
    expect(forgot.body.data.otp.devOtp).toMatch(/^\d{6}$/);

    const verifiedReset = await request(app).post('/api/v1/auth/verify-password-reset-otp').send({
      email: 'customer@example.com',
      otp: forgot.body.data.otp.devOtp
    });

    expect(verifiedReset.status).toBe(200);
    expect(verifiedReset.body.data.resetToken).toBeTruthy();

    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'customer@example.com',
      resetToken: verifiedReset.body.data.resetToken,
      newPassword: 'newpassword123'
    });

    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'customer@example.com',
      password: 'newpassword123'
    });

    expect(login.status).toBe(200);
    customerToken = login.body.data.accessToken;
    customerRefreshToken = login.body.data.refreshToken;
  });

  it('lets the owner create dishes before admin approval', async () => {
    const dish = await request(app)
      .post('/api/v1/owner/dishes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Schnitzel',
        description: 'Crispy signature dish',
        price: 15.45,
        category: 'Main',
        ingredients: ['Chicken', 'Breadcrumbs'],
        isSignature: true
      });

    expect(dish.status).toBe(201);
    dishId = dish.body.data.dish._id;
  });

  it('lets admin activate restaurant and exposes it to customer screens', async () => {
    const activation = await request(app)
      .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(activation.status).toBe(200);
    expect(activation.body.data.restaurant.status).toBe('active');

    const restaurants = await request(app).get('/api/v1/restaurants?search=Restaurant');
    expect(restaurants.status).toBe(200);
    expect(restaurants.body.data.restaurants).toHaveLength(1);

    const nearby = await request(app).get('/api/v1/restaurants/nearby?lat=23.8103&lng=90.4125&radius=1000');
    expect(nearby.status).toBe(200);
    expect(nearby.body.data.restaurants).toHaveLength(1);

    const details = await request(app).get(`/api/v1/restaurants/${restaurantId}`);
    expect(details.status).toBe(200);
    expect(details.body.data.signatureDishes[0]._id).toBe(dishId);
  });

  it('supports saved items, reviews, check-ins, and view tracking', async () => {
    const saved = await request(app)
      .post('/api/v1/me/saved')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ itemType: 'restaurant', id: restaurantId });

    expect(saved.status).toBe(200);

    const restaurantList = await request(app)
      .get('/api/v1/restaurants')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(restaurantList.status).toBe(200);
    expect(restaurantList.body.data.restaurants[0].isSaved).toBe(true);

    const checkIn = await request(app)
      .post(`/api/v1/restaurants/${restaurantId}/check-ins`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ lat: 23.8103, lng: 90.4125 });

    expect(checkIn.status).toBe(201);

    const review = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        restaurantId,
        dishId,
        rating: 5,
        comment: 'Excellent food'
      });

    expect(review.status).toBe(201);
    reviewId = review.body.data.review._id;

    const myReviews = await request(app)
      .get('/api/v1/me/reviews')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(myReviews.status).toBe(200);
    expect(myReviews.body.data.reviews).toHaveLength(1);

    const updatedReview = await request(app)
      .patch(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 4,
        comment: 'Updated review text'
      });

    expect(updatedReview.status).toBe(200);
    expect(updatedReview.body.data.review.rating).toBe(4);

    const dishDetails = await request(app)
      .get(`/api/v1/dishes/${dishId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(dishDetails.status).toBe(200);
    expect(dishDetails.body.data.dish.isSaved).toBe(false);

    const view = await request(app)
      .post(`/api/v1/restaurants/${restaurantId}/views`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send();

    expect(view.status).toBe(201);
  });

  it('returns owner and admin summaries used by dashboard screens', async () => {
    const ownerDashboard = await request(app)
      .get('/api/v1/owner/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerDashboard.status).toBe(200);
    expect(ownerDashboard.body.data.metrics.totalDishes).toBe(1);

    const adminDashboard = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminDashboard.status).toBe(200);
    expect(adminDashboard.body.data.totals.restaurants).toBe(1);

    const adminDish = await request(app)
      .get(`/api/v1/admin/dishes/${dishId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminDish.status).toBe(200);
    expect(adminDish.body.data.dish._id).toBe(dishId);

    const adminDishStatus = await request(app)
      .patch(`/api/v1/admin/dishes/${dishId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(adminDishStatus.status).toBe(200);
    expect(adminDishStatus.body.data.dish.status).toBe('active');
  });

  it('lets admin moderate reviews and manage static pages', async () => {
    const sdReview = await request(app)
      .post('/api/v1/admin/reviews/sd')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        restaurantId,
        dishId,
        rating: 5,
        comment: 'SD editorial review'
      });

    expect(sdReview.status).toBe(201);
    expect(sdReview.body.data.review.reviewType).toBe('sd_admin');

    const overriddenReview = await request(app)
      .patch(`/api/v1/admin/reviews/${reviewId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rating: 3,
        comment: 'Admin adjusted customer review',
        overrideReason: 'Moderation correction'
      });

    expect(overriddenReview.status).toBe(200);
    expect(overriddenReview.body.data.review.overriddenBy).toBeTruthy();
    expect(overriddenReview.body.data.review.originalReview.rating).toBe(4);

    const sdReviews = await request(app)
      .get('/api/v1/admin/reviews?reviewType=sd_admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(sdReviews.status).toBe(200);
    expect(sdReviews.body.data.reviews).toHaveLength(1);

    const hiddenReview = await request(app)
      .patch(`/api/v1/admin/reviews/${reviewId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'hidden' });

    expect(hiddenReview.status).toBe(200);
    expect(hiddenReview.body.data.review.status).toBe('hidden');

    const page = await request(app)
      .patch('/api/v1/admin/pages/terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Terms of condition',
        content: 'Sample terms for frontend integration.'
      });

    expect(page.status).toBe(200);

    const publicPage = await request(app).get('/api/v1/pages/terms');
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.data.page.slug).toBe('terms');
  });

  it('supports the API contract used by the Flutter app and dashboard', async () => {
    const signup = await request(app).post('/api/auth/register').send({
      name: 'Flutter Signup User',
      email: 'flutter-signup@example.com',
      password: 'password123',
      role: 'user'
    });
    expect(signup.status).toBe(201);
    expect(signup.body.data.isVerified).toBe(true);
    expect(signup.body.token).toBeTruthy();
    expect(signup.body.otp).toBeUndefined();

    const cleanupSignup = await request(app)
      .delete('/api/auth/delete/user')
      .set('Authorization', `Bearer ${signup.body.token}`);
    expect(cleanupSignup.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'password123'
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.data.role).toBe('admin');

    const deals = await request(app).get('/api/deals?sort=rating');
    expect(deals.status).toBe(200);
    expect(deals.body.deals[0].title).toBe('Restaurant JAN');
    expect(deals.body.deals[0].dishes[0].name).toBe('Schnitzel');
    expect(Array.isArray(deals.body.deals[0].images)).toBe(true);

    const categories = await request(app).get('/api/categories');
    expect(categories.status).toBe(200);
    expect(categories.body.data.some((category) => category.categoryName === 'German')).toBe(true);

    const users = await request(app)
      .get('/api/auth/all/user')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(users.status).toBe(200);
    expect(users.body.meta.totalItems).toBe(1);

    const managed = await request(app)
      .get(`/api/manage/deals/${restaurantId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(managed.status).toBe(200);
    expect(managed.body.restaurant.approvalStatus).toBe('approved');

    const ownerRestaurant = await request(app)
      .get('/api/owner/restaurant')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerRestaurant.status).toBe(200);
    expect(ownerRestaurant.body.restaurant._id).toBe(restaurantId);

    const saved = await request(app)
      .get('/api/saved')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(saved.status).toBe(200);
    expect(saved.body.items[0].restaurant._id).toBe(restaurantId);

    const checkIns = await request(app)
      .get('/api/check-ins/my')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(checkIns.status).toBe(200);
    expect(checkIns.body.data[0].restaurantId._id).toBe(restaurantId);

    const reviews = await request(app)
      .get(`/api/reviews?dealId=${restaurantId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reviews.status).toBe(200);
    expect(reviews.body.data[0].dealID._id).toBe(restaurantId);
    expect(reviews.body.data[0]).toHaveProperty('reviewComment');
    expect(reviews.body.data[0]).toHaveProperty('ratings');

    const legal = await request(app).get('/api/content/legal');
    expect(legal.status).toBe(200);
    expect(legal.body.content.termsHtml).toContain('Sample terms');

    const stats = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.totalDeals).toBe(1);
    expect(stats.body.data.totalCheckIns).toBe(1);
  });

  it('cascades account deletion without leaving active related records', async () => {
    const deletedCustomer = await request(app)
      .delete(`/api/v1/admin/users/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deletedCustomer.status).toBe(200);

    const ownerCheckIns = await request(app)
      .get('/api/v1/owner/check-ins')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerCheckIns.status).toBe(200);
    expect(ownerCheckIns.body.data.checkIns).toHaveLength(0);

    const ownerViewers = await request(app)
      .get('/api/v1/owner/viewers')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerViewers.status).toBe(200);
    expect(ownerViewers.body.data.viewers).toHaveLength(0);

    const ownerDashboard = await request(app)
      .get('/api/v1/owner/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerDashboard.status).toBe(200);
    expect(ownerDashboard.body.data.metrics.totalReviews).toBe(1);

    const deletedOwner = await request(app)
      .delete(`/api/v1/admin/users/${ownerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deletedOwner.status).toBe(200);

    const restaurants = await request(app).get('/api/v1/restaurants');
    expect(restaurants.status).toBe(200);
    expect(restaurants.body.data.restaurants).toHaveLength(0);
  });

  it('keeps upload validation available without Cloudinary credentials', async () => {
    const upload = await request(app).post('/api/v1/uploads').send();
    expect(upload.status).toBe(400);
  });
});
