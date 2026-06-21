import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let app;
let mongoServer;
let adminToken;
let ownerToken;
let customerToken;
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
  it('registers admin, owner with pending restaurant, and customer accounts', async () => {
    const admin = await request(app).post('/api/v1/auth/register').send({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin'
    });

    expect(admin.status).toBe(201);
    adminToken = admin.body.data.token;

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
    ownerToken = owner.body.data.token;
    ownerId = owner.body.data.user._id;
    restaurantId = owner.body.data.restaurant._id;
    expect(owner.body.data.restaurant.status).toBe('pending');

    const customer = await request(app).post('/api/v1/auth/register').send({
      name: 'Customer User',
      email: 'customer@example.com',
      password: 'password123',
      role: 'customer'
    });

    expect(customer.status).toBe(201);
    customerToken = customer.body.data.token;
    customerId = customer.body.data.user._id;
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

    const checkIn = await request(app)
      .post(`/api/v1/restaurants/${restaurantId}/check-ins`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ lat: 23.8103, lng: 90.4125 });

    expect(checkIn.status).toBe(201);

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
  });

  it('lets admin moderate reviews and manage static pages', async () => {
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
    expect(ownerDashboard.body.data.metrics.totalReviews).toBe(0);

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
