import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import Dish from "../models/dish.model.js";
import Review from "../models/review.model.js";
import Promotion from "../models/promotion.model.js";
import RestaurantView from "../models/restaurantView.model.js";
import { createAuthTokens } from "../utils/authTokens.js";
import { isOpenNow } from "../utils/discovery.js";
import { recalculateReviewTargets } from "../utils/recalculateRatings.js";
import { jest } from "@jest/globals";
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  jwtVerify,
  SignJWT,
} from "jose";
import { createHash } from "node:crypto";
let signingKey;
let mongo, app, admin, owner, customer, cheap, expensive, dish;
beforeAll(async () => {
  process.env.JWT_SECRET = "agreed-feature-tests";
  process.env.NODE_ENV = "test";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  const publicKey = await exportJWK(pair.publicKey);
  publicKey.kid = "test-key";
  publicKey.alg = "RS256";
  const keys = createLocalJWKSet({ keys: [publicKey] });
  jest.unstable_mockModule("jose", () => ({
    createRemoteJWKSet: () => keys,
    jwtVerify,
  }));
  ({ default: app } = await import("../app.js"));
  const account = async (role) => {
    const user = await User.create({
      name: role,
      email: `${role}@audit.test`,
      role,
      emailVerified: true,
    });
    return { user, token: (await createAuthTokens(user)).token };
  };
  admin = await account("admin");
  owner = await account("restaurant_owner");
  customer = await account("customer");
  cheap = await Restaurant.create({
    owner: owner.user._id,
    name: "Cheap cafe",
    city: "Berlin",
    price: 8,
    priceRange: "$",
    categories: ["Coffee"],
    status: "active",
    ratingAverage: 3,
    location: { type: "Point", coordinates: [13.405, 52.52] },
    openingHours: [
      { day: "Monday", open: "00:00", close: "00:00", closed: false },
    ],
    timeZone: "UTC",
  });
  expensive = await Restaurant.create({
    owner: admin.user._id,
    name: "Expensive restaurant",
    city: "Berlin",
    price: 30,
    priceRange: "$$$",
    status: "active",
    ratingAverage: 5,
    location: { type: "Point", coordinates: [13.41, 52.52] },
  });
  dish = await Dish.create({
    restaurant: cheap._id,
    name: "Cake",
    price: 8,
    tags: ["Vegan"],
    isSignature: true,
    description: "Cake",
  });
  await Restaurant.syncIndexes();
  await RestaurantView.syncIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

test("both public registration surfaces reject admin creation", async () => {
  for (const path of ["/api/auth/register", "/api/v1/auth/register"]) {
    const result = await request(app).post(path).send({
      name: "Intruder",
      email: "intruder@audit.test",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(403);
  }
  expect(await User.countDocuments({ email: "intruder@audit.test" })).toBe(0);
});
test("nearby pagination, price/rating sorts and combined search filters work", async () => {
  const nearby = { latitude: 52.52, longitude: 13.405, radiusKm: 10 };
  const nearest = await request(app)
    .get("/api/deals")
    .query({ ...nearby, sort: "nearest", limit: 1 });
  expect(nearest.status).toBe(200);
  expect(nearest.body.deals[0]._id).toBe(String(cheap._id));
  expect(nearest.body.pagination.totalItems).toBe(2);
  const price = await request(app)
    .get("/api/deals")
    .query({ ...nearby, sort: "priceDesc" });
  expect(price.status).toBe(200);
  expect(price.body.deals[0]._id).toBe(String(expensive._id));
  const rating = await request(app)
    .get("/api/deals")
    .query({ ...nearby, sort: "rating" });
  expect(rating.body.deals[0]._id).toBe(String(expensive._id));
  const filtered = await request(app)
    .get("/api/deals")
    .query({ title: "does not exist", location: "Berlin" });
  expect(filtered.body.deals).toHaveLength(0);
  expect(
    (
      await request(app)
        .get("/api/deals")
        .query({ ...nearby, latitude: 100 })
    ).status,
  ).toBe(400);
  const vegan = await request(app)
    .get("/api/deals")
    .query({ tags: "Vegan", priceRange: "$" });
  expect(vegan.body.deals.map((r) => r._id)).toEqual([String(cheap._id)]);
});
test("open-now handles restaurant timezone and overnight hours", () => {
  const r = {
    timeZone: "Europe/Berlin",
    openingHours: [
      { day: "Sunday", open: "22:00", close: "02:00", closed: false },
    ],
  };
  expect(isOpenNow(r, new Date("2026-11-02T00:30:00Z"))).toBe(true);
  expect(isOpenNow(r, new Date("2026-11-02T02:30:00Z"))).toBe(false);
  expect(
    isOpenNow(
      { ...r, opensAt: new Date("2030-01-01") },
      new Date("2026-11-02T00:30:00Z"),
    ),
  ).toBe(false);
});
test("only current promotions reach discovery and dish targets are validated", async () => {
  const data = {
    restaurant: String(cheap._id),
    dish: String(dish._id),
    title: "Cake offer",
    discountType: "percent",
    discountValue: 20,
    startsAt: "2020-01-01",
    endsAt: "2030-01-01",
  };
  expect(
    (
      await request(app)
        .post("/api/admin/promotions")
        .set(auth(owner))
        .send(data)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/admin/promotions")
        .set(auth(admin))
        .send({ ...data, discountValue: 101 })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/api/admin/promotions")
        .set(auth(admin))
        .send({ ...data, restaurant: String(expensive._id) })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/api/admin/promotions")
        .set(auth(admin))
        .send(data)
    ).status,
  ).toBe(200);
  await Promotion.create({ ...data, title: "Expired", endsAt: "2021-01-01" });
  const result = await request(app).get(`/api/deals/${cheap._id}`);
  expect(result.body.deal.promotions.map((p) => p.title)).toEqual([
    "Cake offer",
  ]);
});
test("team review visibility and moderation leave customer aggregate separate", async () => {
  const review = await request(app)
    .post("/api/admin/team-reviews")
    .set(auth(admin))
    .send({
      restaurantId: String(cheap._id),
      dishId: String(dish._id),
      rating: 5,
      comment: "Team visit",
    });
  expect(review.status).toBe(201);
  let result = await request(app).get(`/api/reviews/deal/${cheap._id}`);
  expect(result.body.reviews[0].reviewType).toBe("sd_admin");
  expect(result.body.reviews[0].adminAuthor.name).toBe("admin");
  await request(app)
    .put(`/api/admin/restaurants/${cheap._id}`)
    .set(auth(owner))
    .send({ showTeamReviews: false });
  expect((await Restaurant.findById(cheap._id)).showTeamReviews).toBe(true);
  await request(app)
    .put(`/api/admin/restaurants/${cheap._id}`)
    .set(auth(admin))
    .send({ showTeamReviews: false });
  expect(
    (await request(app).get(`/api/reviews/deal/${cheap._id}`)).body.reviews,
  ).toHaveLength(0);
  await request(app)
    .put("/api/content/app-settings")
    .set(auth(admin))
    .send({ showTeamReviews: false });
  result = await request(app).get(`/api/reviews/deal/${cheap._id}`);
  expect(result.body.reviews).toHaveLength(0);
  const customerReview = await Review.create({
    user: customer.user._id,
    restaurant: cheap._id,
    dish: dish._id,
    rating: 2,
    comment: "Visit",
  });
  expect(
    (
      await request(app)
        .patch(`/api/admin/reviews/${customerReview._id}/status`)
        .set(auth(owner))
        .send({ status: "hidden" })
    ).status,
  ).toBe(403);
  await request(app)
    .patch(`/api/admin/reviews/${customerReview._id}/status`)
    .set(auth(admin))
    .send({ status: "hidden" });
  expect((await Restaurant.findById(cheap._id)).ratingCount).toBe(0);
  await request(app)
    .patch(`/api/admin/reviews/${customerReview._id}/status`)
    .set(auth(admin))
    .send({ status: "active" });
  expect((await Restaurant.findById(cheap._id)).ratingAverage).toBe(2);
  const mine = await request(app)
    .get("/api/reviews?mine=true")
    .set(auth(customer));
  expect(mine.body.data.map((r) => r._id)).toEqual([
    String(customerReview._id),
  ]);
});
test("actual restaurant views are deduplicated and owner-scoped", async () => {
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request(app)
          .post(`/api/restaurants/${cheap._id}/views`)
          .set(auth(customer))
      ).status,
    ).toBe(200);
  await request(app)
    .post(`/api/restaurants/${cheap._id}/views`)
    .set(auth(owner));
  await request(app)
    .post(`/api/restaurants/${expensive._id}/views`)
    .set(auth(customer));
  const stats = await request(app).get("/api/dashboard/stats").set(auth(owner));
  expect(stats.body.data.totalViews).toBe(1);
  expect(stats.body.data.totalCustomers).toBe(0);
  const views = await request(app).get("/api/owner/views").set(auth(owner));
  expect(views.body.data).toHaveLength(1);
  expect(views.body.data[0]).not.toHaveProperty("ip");
});
test("managed content enforces role access and sanitizes formatted HTML", async () => {
  expect(
    (
      await request(app)
        .post("/api/admin/catalog")
        .set(auth(owner))
        .send({ kind: "city", name: "Hamburg" })
    ).status,
  ).toBe(403);
  const city = await request(app)
    .post("/api/admin/catalog")
    .set(auth(admin))
    .send({ kind: "city", name: "Hamburg" });
  expect(city.status).toBe(200);
  const options = await request(app).get("/api/discovery/options");
  expect(options.body.cities).toContain("Hamburg");
  const legal = await request(app)
    .put("/api/content/legal")
    .set(auth(admin))
    .send({
      impressumHtml:
        '<p class="ql-align-center"><b>Company</b><script>alert(1)</script><a href="javascript:alert(1)">X</a></p>',
    });
  expect(legal.body.content.impressumHtml).toContain("ql-align-center");
  expect(legal.body.content.impressumHtml).not.toMatch(/script|javascript:/);
  const safety = await request(app)
    .put(`/api/admin/restaurants/${cheap._id}/safety`)
    .set(auth(admin))
    .send({
      healthNotice: "Notice",
      safetyComment: "Comment",
      safetyDisclaimer: "Disclaimer",
    });
  expect(safety.status).toBe(200);
  expect(
    (await request(app).get(`/api/deals/${cheap._id}`)).body.deal.healthNotice,
  ).toBe("Notice");
});
test("partial restaurant updates preserve offers and location; gallery cap is enforced", async () => {
  cheap.offers = ["Existing offer"];
  await cheap.save();
  const result = await request(app)
    .put(`/api/admin/restaurants/${cheap._id}`)
    .set(auth(owner))
    .send({ title: "Updated cafe" });
  expect(result.status).toBe(200);
  expect(result.body.restaurant.offers).toEqual(["Existing offer"]);
  expect(result.body.restaurant.location.latitude).toBe(52.52);
  const tooMany = await request(app)
    .put(`/api/admin/restaurants/${cheap._id}`)
    .set(auth(owner))
    .send({
      existingImages: Array.from(
        { length: 11 },
        (_, i) => `https://example.com/${i}.jpg`,
      ),
    });
  expect(tooMany.status).toBe(400);
});
test("social identity verifies signature, audience and email; linking needs an authenticated account", async () => {
  process.env.GOOGLE_CLIENT_IDS = "test-client";
  const token = async (claims, audience = "test-client") =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signingKey);
  const claims = {
    sub: "new-google-user",
    email: "google@audit.test",
    email_verified: true,
    name: "Google User",
  };
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({
          provider: "google",
          idToken: await token(claims, "wrong-client"),
        })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({
          provider: "google",
          idToken: await token({ ...claims, email_verified: false }),
        })
    ).status,
  ).toBe(401);
  const result = await request(app)
    .post("/api/auth/social")
    .send({ provider: "google", idToken: await token(claims) });
  expect(result.status).toBe(200);
  expect(result.body.data.role).toBe("user");
  expect(result.body.data).not.toHaveProperty("googleSubject");
  expect(result.body.token).toBeTruthy();
  const collision = {
    sub: "link-google-user",
    email: customer.user.email,
    email_verified: true,
  };
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({ provider: "google", idToken: await token(collision) })
    ).status,
  ).toBe(409);
  const linked = await request(app)
    .post("/api/auth/social")
    .set(auth(customer))
    .send({ provider: "google", idToken: await token(collision) });
  expect(linked.status).toBe(200);
  expect(linked.body.data._id).toBe(String(customer.user._id));
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .set(auth(owner))
        .send({ provider: "google", idToken: await token(collision) })
    ).status,
  ).toBe(409);
});
test("Apple identity requires a valid single-use server nonce", async () => {
  process.env.APPLE_CLIENT_IDS = "test-apple-client";
  const challenge = await request(app).get("/api/auth/social/challenge");
  const nonce = challenge.body.nonce;
  expect(
    (await request(app).post("/api/auth/apple/callback").send({ state: "bad" }))
      .status,
  ).toBe(400);
  const callback = await request(app)
    .post("/api/auth/apple/callback")
    .send({ state: nonce, code: "temporary-code" });
  expect(callback.status).toBe(302);
  expect(callback.headers.location).toContain("scheme=signinwithapple");
  const idToken = await new SignJWT({
    sub: "apple-user",
    email: "apple@audit.test",
    email_verified: "true",
    nonce: createHash("sha256").update(nonce).digest("hex"),
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://appleid.apple.com")
    .setAudience("test-apple-client")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({ provider: "apple", idToken, nonce: "incorrect" })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({ provider: "apple", idToken, nonce })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .post("/api/auth/social")
        .send({ provider: "apple", idToken, nonce })
    ).status,
  ).toBe(401);
});

test("authenticated linking accepts a different provider email without creating or switching accounts", async () => {
  const token = async (sub, email) =>
    new SignJWT({ sub, email, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience("test-client")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signingKey);
  const linked = await request(app)
    .post("/api/auth/social")
    .set(auth(owner))
    .send({
      provider: "google",
      idToken: await token("owner-google", "separate-google@audit.test"),
    });
  expect(linked.status).toBe(200);
  expect(linked.body.data._id).toBe(String(owner.user._id));
  expect(
    await User.countDocuments({ email: "separate-google@audit.test" }),
  ).toBe(0);
  const replacement = await request(app)
    .post("/api/auth/social")
    .set(auth(owner))
    .send({
      provider: "google",
      idToken: await token("replacement-google", "another-google@audit.test"),
    });
  expect(replacement.status).toBe(409);
  expect(
    await User.countDocuments({ email: "another-google@audit.test" }),
  ).toBe(0);
  const again = await request(app)
    .post("/api/auth/social")
    .send({
      provider: "google",
      idToken: await token("owner-google", "separate-google@audit.test"),
    });
  expect(again.status).toBe(200);
  expect(again.body.data._id).toBe(String(owner.user._id));
});

test("managed default labels can be deactivated and renamed without stale choices or duplicate dish tags", async () => {
  const vegan = await request(app)
    .post("/api/admin/catalog")
    .set(auth(admin))
    .send({ kind: "tag", name: "Vegan", active: false });
  expect(vegan.status).toBe(200);
  expect(
    (await request(app).get("/api/discovery/options")).body.tags,
  ).not.toContain("Vegan");
  await Dish.updateOne({ _id: dish._id }, { tags: ["Vegan", "Plant-based"] });
  const renamed = await request(app)
    .put(`/api/admin/catalog/${vegan.body.data._id}`)
    .set(auth(admin))
    .send({ kind: "tag", name: "Plant-based", active: true });
  expect(renamed.status).toBe(200);
  const tags = (await request(app).get("/api/discovery/options")).body.tags;
  expect(tags).toContain("Plant-based");
  expect(tags).not.toContain("Vegan");
  expect((await Dish.findById(dish._id)).tags).toEqual(["Plant-based"]);
});

test("concurrent refreshes produce one view per visitor and restaurant", async () => {
  await RestaurantView.deleteMany({ restaurant: expensive._id });
  await Restaurant.updateOne({ _id: expensive._id }, { viewCount: 0 });
  const requests = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(app)
        .post(`/api/restaurants/${expensive._id}/views`)
        .set(auth(customer)),
    ),
  );
  expect(requests.every((response) => response.status === 200)).toBe(true);
  expect(
    await RestaurantView.countDocuments({ restaurant: expensive._id }),
  ).toBe(1);
  expect((await Restaurant.findById(expensive._id)).viewCount).toBe(1);
});

test("malformed form data is rejected and all cuisine categories round-trip", async () => {
  const update = (data) =>
    request(app)
      .put(`/api/admin/restaurants/${cheap._id}`)
      .set(auth(owner))
      .send(data);
  expect((await update({ openingHours: "{malformed-json" })).status).toBe(400);
  expect((await update({ timeZone: null })).status).toBe(400);
  expect((await update({ contactEmail: "invalid-email" })).status).toBe(400);
  const cuisines = await update({ categories: ["Coffee", "Dessert"] });
  expect(cuisines.status).toBe(200);
  expect(cuisines.body.restaurant.categories).toEqual(["Coffee", "Dessert"]);
  for (const price of ["invalid", "", null, -1]) {
    const response = await request(app)
      .put(`/api/restaurants/${cheap._id}/dishes/${dish._id}`)
      .set(auth(owner))
      .send({ price });
    expect(response.status).toBe(400);
  }
  expect(
    (
      await request(app)
        .put(`/api/restaurants/${cheap._id}/dishes/${dish._id}`)
        .set(auth(owner))
        .send({ description: "<p><br></p>" })
    ).status,
  ).toBe(400);
  for (const query of [
    { minimumRating: "invalid" },
    { minPrice: "invalid" },
    { radiusKm: -1 },
    { minPrice: 10, maxPrice: 2 },
  ]) {
    expect((await request(app).get("/api/deals").query(query)).status).toBe(
      400,
    );
  }
});

test("Team Review visibility is respected by both public API surfaces", async () => {
  const legacy = await request(app).get(`/api/reviews/deal/${cheap._id}`);
  expect(legacy.body.reviews.every((r) => r.reviewType === "customer")).toBe(
    true,
  );
  const modern = await request(app)
    .get("/api/v1/reviews")
    .query({ restaurantId: String(cheap._id), reviewType: "sd_admin" });
  expect(modern.status).toBe(200);
  expect(modern.body.data.reviews).toHaveLength(0);
});

test("bulk spam removal recalculates both rating targets and deleted reviews cannot be edited", async () => {
  const review = await Review.create({
    user: customer.user._id,
    restaurant: cheap._id,
    dish: dish._id,
    rating: 4,
    comment: "Remove spam",
  });
  await recalculateReviewTargets(review);
  expect((await Restaurant.findById(cheap._id)).ratingAverage).toBe(3);
  const removed = await request(app)
    .delete("/api/reviews/bulk")
    .set(auth(admin))
    .send({ ids: [String(review._id)] });
  expect(removed.status).toBe(200);
  expect((await Restaurant.findById(cheap._id)).ratingAverage).toBe(2);
  expect((await Dish.findById(dish._id)).ratingAverage).toBe(2);
  expect(
    (
      await request(app)
        .put(`/api/reviews/${review._id}`)
        .set(auth(admin))
        .send({ ratings: 5 })
    ).status,
  ).toBe(404);
});
