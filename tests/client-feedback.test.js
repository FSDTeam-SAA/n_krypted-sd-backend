import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

const upload = jest.fn(async (buffer, folder) => ({
  public_id: `${folder}/${buffer.toString('hex')}`,
  secure_url: `https://example.com/${buffer.toString('hex')}.png`
}));
jest.unstable_mockModule('../utils/cloudinaryUpload.js', () => ({
  streamUpload: upload,
  toImageAsset: (result) => result,
  deleteCloudinaryImage: jest.fn(async () => ({}))
}));

let mongo;
let app;
let ownerToken;
let customerToken;
let restaurantId;
beforeAll(async () => {
  process.env.JWT_SECRET = 'feedback-test-secret';
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: app } = await import('../app.js'));
  for (const role of ['restaurant_owner', 'user']) {
    const response = await request(app).post('/api/auth/register').send({
      name: role, email: `${role}@feedback.example`, password: 'password123', role
    });
    expect(response.status).toBe(201);
    if (role === 'restaurant_owner') ownerToken = response.body.token;
    else customerToken = response.body.token;
  }
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const submission = (options = {}) => {
  const dishes = Array.from({ length: options.dishCount ?? 3 }, (_, index) => ({
    name: `Signature ${index + 1}`, description: `Description ${index + 1}`,
    price: 10 + index, imageIndexes: [2 + index]
  }));
  let req = request(app).post('/api/owner/restaurant')
    .set('Authorization', `Bearer ${options.token ?? ownerToken}`)
    .field('title', 'Feedback Restaurant')
    .field('description', 'A complete registration')
    .field('location', JSON.stringify(options.location ?? { address: 'Test street', city: 'Berlin', country: 'Deutschland', latitude: 52.52, longitude: 13.405 }))
    .field('restaurantImageCount', '2')
    .field('photoCategories', JSON.stringify(options.photoCategories ?? ['interior', 'exterior']))
    .field('signatureDishes', JSON.stringify(dishes));
  for (let i = 0; i < 2 + dishes.length; i++) {
    req = req.attach('images', Buffer.from(`photo-${i}`), { filename: `${i}.png`, contentType: 'image/png' });
  }
  return req;
};

test('invalid coordinates and incomplete photo sections fail before upload or DB writes', async () => {
  const badLocation = await submission({ location: { latitude: '', longitude: '' } });
  expect(badLocation.status).toBe(400);
  const badPhotos = await submission({ photoCategories: ['interior', 'interior'] });
  expect(badPhotos.status).toBe(400);
  const tooMany = await submission({ dishCount: 4 });
  expect(tooMany.status).toBe(400);
  expect(upload).not.toHaveBeenCalled();
  expect(await mongoose.model('Restaurant').countDocuments()).toBe(0);
});

test('one owner submission saves three described dishes and correctly categorized photos', async () => {
  const response = await submission();
  expect(response.status).toBe(201);
  const restaurant = response.body.restaurant;
  restaurantId = restaurant._id;
  expect(restaurant.approvalStatus).toBe('pending');
  expect(restaurant.photoCategories).toEqual(['interior', 'exterior']);
  expect(restaurant.images).toHaveLength(2);
  expect(restaurant.dishes).toHaveLength(3);
  expect(restaurant.price).toBe(10);
  for (let i = 0; i < 3; i++) {
    expect(restaurant.dishes[i].isSignatureDish).toBe(true);
    expect(restaurant.dishes[i].description).toBe(`Description ${i + 1}`);
    expect(restaurant.dishes[i].images).toEqual([`https://example.com/${Buffer.from(`photo-${i + 2}`).toString('hex')}.png`]);
  }
  const fetched = await request(app).get('/api/owner/restaurant').set('Authorization', `Bearer ${ownerToken}`);
  expect(fetched.body.restaurant.photoCategories).toEqual(['interior', 'exterior']);
  expect(fetched.body.restaurant.dishes).toHaveLength(3);
});

test.each([1, 2])('registration also accepts %i signature dishes', async (dishCount) => {
  const owner = await request(app).post('/api/auth/register').send({
    name: `Owner ${dishCount}`, email: `owner-${dishCount}@feedback.example`,
    password: 'password123', role: 'restaurant_owner'
  });
  expect(owner.status).toBe(201);
  const response = await submission({ dishCount, token: owner.body.token });
  expect(response.status).toBe(201);
  expect(response.body.restaurant.dishes).toHaveLength(dishCount);
});

test('owner cannot add a fourth signature dish through either API surface', async () => {
  const legacy = await request(app).post(`/api/restaurants/${restaurantId}/dishes`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Fourth', description: 'Description', price: 15, isSignatureDish: true });
  expect(legacy.status).toBe(400);
  const native = await request(app).post('/api/v1/owner/dishes')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Fourth', description: 'Description', price: 15, isSignature: true });
  expect(native.status).toBe(400);
  expect(await mongoose.model('Dish').countDocuments({ restaurant: restaurantId })).toBe(3);
});

test('categorized restaurant photos survive edits and all signature dishes reach customer details', async () => {
  const edited = await request(app).put(`/api/admin/restaurants/${restaurantId}`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ title: 'Updated Restaurant', existingImages: ['https://example.com/outside.png', 'https://example.com/inside.png'], photoCategories: ['exterior', 'interior'] });
  expect(edited.status).toBe(200);
  expect(edited.body.restaurant.photoCategories).toEqual(['exterior', 'interior']);
  await mongoose.model('Restaurant').findByIdAndUpdate(restaurantId, { status: 'active' });
  const details = await request(app).get(`/api/deals/${restaurantId}`);
  expect(details.status).toBe(200);
  expect(details.body.deal.dishes).toHaveLength(3);
});

test('legacy edits without category metadata preserve categorized restaurant photos', async () => {
  const edited = await request(app).put(`/api/admin/restaurants/${restaurantId}`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ title: 'Metadata edit', existingImages: ['https://example.com/inside.png', 'https://example.com/outside.png'] });
  expect(edited.status).toBe(200);
  expect(edited.body.restaurant.photoCategories).toEqual(['interior', 'exterior']);
  const saved = await mongoose.model('Restaurant').findById(restaurantId);
  expect(saved.gallery.map((image) => image.category)).toEqual(['interior', 'exterior']);
});

test('dashboard multipart edits categorize retained photos before new uploads', async () => {
  const response = await request(app).put(`/api/admin/restaurants/${restaurantId}`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .field('existingImages', JSON.stringify(['https://example.com/inside.png', 'https://example.com/outside.png']))
    .field('photoCategories', JSON.stringify(['interior', 'exterior', 'other']))
    .attach('images', Buffer.from('terrace'), { filename: 'terrace.png', contentType: 'image/png' });
  expect(response.status).toBe(200);
  expect(response.body.restaurant.photoCategories).toEqual(['interior', 'exterior', 'other']);
  expect(response.body.restaurant.images[2]).toBe(`https://example.com/${Buffer.from('terrace').toString('hex')}.png`);
});

test('check-in rejects missing/far GPS data and accepts a nearby customer', async () => {
  for (const body of [{}, { lat: 53, lng: 13.405 }, { lat: '', lng: '' }]) {
    const response = await request(app).post(`/api/v1/restaurants/${restaurantId}/check-ins`)
      .set('Authorization', `Bearer ${customerToken}`).send(body);
    expect(response.status).toBe(400);
  }
  for (const body of [{}, { latitude: '', longitude: '' }, { latitude: 53, longitude: 13.405 }]) {
    const response = await request(app).post('/api/check-ins')
      .set('Authorization', `Bearer ${customerToken}`).send({ restaurantId, ...body });
    expect(response.status).toBe(400);
  }
  const near = await request(app).post('/api/check-ins')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ restaurantId, latitude: 52.5201, longitude: 13.405, accuracy: 10, partySize: 1 });
  expect(near.status).toBe(201);
  expect(near.body.data.distanceMeters).toBeLessThan(100);
  expect(await mongoose.model('CheckIn').countDocuments()).toBe(1);
});
