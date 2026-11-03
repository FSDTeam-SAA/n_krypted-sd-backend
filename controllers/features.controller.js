import { z } from "zod";
import CatalogEntry from "../models/catalogEntry.model.js";
import AppSettings from "../models/appSettings.model.js";
import Promotion from "../models/promotion.model.js";
import Restaurant from "../models/restaurant.model.js";
import Dish from "../models/dish.model.js";
import Review from "../models/review.model.js";
import RestaurantView from "../models/restaurantView.model.js";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";
import { sendLegacy } from "../utils/legacyApi.js";
import { legacyReview, legacyMeta } from "../utils/legacySerializers.js";
import { validate, safeUrl, cleanHtml } from "../utils/content.js";
import { getPagination } from "../utils/pagination.js";
import { recalculateReviewTargets } from "../utils/recalculateRatings.js";
import { validCoordinate } from "../utils/checkInLocation.js";
import { createHash } from "node:crypto";

const entrySchema = z.object({
  kind: z.enum(["city", "tag"]),
  name: z.string().trim().min(1).max(120),
  country: z.string().max(120).default(""),
  active: z.boolean().default(true),
});
export const listEntries = catchAsync(async (req, res) =>
  sendLegacy(res, {
    data: await CatalogEntry.find(
      req.query.kind
        ? { kind: validate(z.enum(["city", "tag"]), req.query.kind) }
        : {},
    ).sort({ name: 1 }),
  }),
);
export const saveEntry = catchAsync(async (req, res) => {
  const data = validate(entrySchema, req.body);
  let entry;
  if (req.params.id) {
    entry = await CatalogEntry.findById(req.params.id);
    if (!entry) throw new ApiError(404, "Entry not found");
    const previous = entry.name;
    if (entry.kind !== data.kind)
      throw new ApiError(400, "Entry kind cannot be changed");
    if (previous !== data.name)
      entry.previousNames = [
        ...new Set([...(entry.previousNames || []), previous]),
      ];
    Object.assign(entry, data);
    await entry.save();
    if (previous !== data.name) {
      if (data.kind === "city")
        await Restaurant.updateMany({ city: previous }, { city: data.name });
      else
        await Dish.updateMany({ tags: previous }, [
          {
            $set: {
              tags: {
                $setUnion: [
                  {
                    $map: {
                      input: "$tags",
                      as: "tag",
                      in: {
                        $cond: [
                          { $eq: ["$$tag", { $literal: previous }] },
                          { $literal: data.name },
                          "$$tag",
                        ],
                      },
                    },
                  },
                  [],
                ],
              },
            },
          },
        ]);
    }
  } else entry = await CatalogEntry.create(data);
  sendLegacy(res, { data: entry });
});
export const getSettings = async () => {
  const stored = await AppSettings.findOne({ key: "public" }).lean();
  return {
    instagramUrl: process.env.INSTAGRAM_URL || "",
    tiktokUrl: process.env.TIKTOK_URL || "",
    contactEmail: "",
    contactPhone: "",
    contactAddress: "",
    showTeamReviews: true,
    ...stored,
    _id: undefined,
    key: undefined,
    __v: undefined,
  };
};
export const readSettings = catchAsync(async (req, res) =>
  sendLegacy(res, { settings: await getSettings() }),
);
export const saveSettings = catchAsync(async (req, res) => {
  const data = validate(
    z.object({
      instagramUrl: safeUrl.optional(),
      tiktokUrl: safeUrl.optional(),
      contactEmail: z.union([z.literal(""), z.string().email()]).optional(),
      contactPhone: z.string().max(80).optional(),
      contactAddress: z.string().max(500).optional(),
      showTeamReviews: z.boolean().optional(),
    }),
    req.body,
  );
  await AppSettings.findOneAndUpdate({ key: "public" }, data, {
    upsert: true,
    runValidators: true,
  });
  sendLegacy(res, { settings: await getSettings() });
});
const promotionSchema = z
  .object({
    restaurant: z.string().regex(/^[a-f\d]{24}$/i),
    dish: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .nullable()
      .optional(),
    title: z.string().trim().min(1).max(160),
    text: z.string().max(2000).default(""),
    bannerUrl: safeUrl.default(""),
    discountType: z.enum(["none", "percent", "amount"]).default("none"),
    discountValue: z.coerce.number().finite().min(0).default(0),
    startsAt: z.preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.coerce.date(),
    ),
    endsAt: z.preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.coerce.date(),
    ),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endsAt > v.startsAt, "End must be after start")
  .refine(
    (v) => v.discountType !== "percent" || v.discountValue <= 100,
    "Percentage cannot exceed 100",
  );
export const listPromotions = catchAsync(async (req, res) =>
  sendLegacy(res, {
    data: await Promotion.find({})
      .populate("restaurant", "name")
      .populate("dish", "name")
      .sort({ startsAt: -1 }),
  }),
);
export const savePromotion = catchAsync(async (req, res) => {
  const data = validate(promotionSchema, req.body);
  if (
    !(await Restaurant.exists({
      _id: data.restaurant,
      status: { $ne: "deleted" },
    }))
  )
    throw new ApiError(404, "Restaurant not found");
  if (
    data.dish &&
    !(await Dish.exists({
      _id: data.dish,
      restaurant: data.restaurant,
      status: { $ne: "deleted" },
    }))
  )
    throw new ApiError(400, "Dish does not belong to restaurant");
  const promotion = req.params.id
    ? await Promotion.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      })
    : await Promotion.create(data);
  if (!promotion) throw new ApiError(404, "Promotion not found");
  sendLegacy(res, { data: promotion });
});
export const createTeamReview = catchAsync(async (req, res) => {
  const data = validate(
    z.object({
      restaurantId: z.string().regex(/^[a-f\d]{24}$/i),
      dishId: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
      rating: z.coerce.number().min(1).max(5),
      comment: z.string().trim().min(1).max(4000),
      status: z.enum(["active", "hidden"]).default("active"),
    }),
    req.body,
  );
  if (
    !(await Restaurant.exists({
      _id: data.restaurantId,
      status: { $ne: "deleted" },
    }))
  )
    throw new ApiError(404, "Restaurant not found");
  if (
    data.dishId &&
    !(await Dish.exists({
      _id: data.dishId,
      restaurant: data.restaurantId,
      status: "active",
    }))
  )
    throw new ApiError(400, "Dish does not belong to restaurant");
  const review = await Review.create({
    restaurant: data.restaurantId,
    dish: data.dishId,
    adminAuthor: req.user._id,
    reviewType: "sd_admin",
    rating: data.rating,
    comment: data.comment,
    status: data.status,
  });
  await review.populate("adminAuthor restaurant dish");
  sendLegacy(res, { review: legacyReview(review) }, 201);
});
export const moderateReview = catchAsync(async (req, res) => {
  const status = validate(z.enum(["active", "hidden"]), req.body.status);
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "deleted" } },
    { status },
    { new: true },
  );
  if (!review) throw new ApiError(404, "Review not found");
  await recalculateReviewTargets(review);
  sendLegacy(res);
});
export const recordView = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    status: "active",
  });
  if (!restaurant) throw new ApiError(404, "Restaurant not found");
  // Do not count an owner's own preview or refresh bursts as new views.
  if (String(restaurant.owner) !== String(req.user?._id)) {
    const identity = req.user
      ? { user: req.user._id }
      : { user: null, ip: req.ip };
    const recent = await RestaurantView.exists({
      restaurant: restaurant._id,
      ...identity,
      createdAt: { $gte: new Date(Date.now() - 30 * 60000) },
    });
    if (!recent) {
      const identityKey = req.user
        ? `user:${req.user._id}`
        : `ip:${createHash("sha256")
            .update(req.ip || "")
            .digest("hex")}`;
      const dedupKey = `${restaurant._id}:${identityKey}:${Math.floor(Date.now() / (30 * 60000))}`;
      let recorded;
      try {
        recorded = await RestaurantView.updateOne(
          { dedupKey },
          {
            $setOnInsert: {
              restaurant: restaurant._id,
              user: req.user?._id,
              ip: req.ip,
              userAgent: req.get("user-agent"),
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      if (recorded?.upsertedCount)
        await Restaurant.updateOne(
          { _id: restaurant._id },
          { $inc: { viewCount: 1 } },
        );
    }
  }
  sendLegacy(res);
});
export const ownerViews = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({
    owner: req.user._id,
    status: { $ne: "deleted" },
  }).select("_id");
  const filter = { restaurant: { $in: restaurants.map((r) => r._id) } };
  const { page, limit, skip } = getPagination(req.query);
  const [data, total] = await Promise.all([
    RestaurantView.find(filter)
      .select("user restaurant createdAt")
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    RestaurantView.countDocuments(filter),
  ]);
  sendLegacy(res, {
    data: data.map((row) => ({
      _id: row._id,
      name: row.user?.name || "Anonymer Besucher",
      avatar: row.user?.avatar?.secure_url || "",
      viewedAt: row.createdAt,
    })),
    meta: legacyMeta(total, page, limit),
  });
});
export const saveSafety = catchAsync(async (req, res) => {
  const data = validate(
    z.object({
      healthNotice: z.string().max(4000),
      safetyComment: z.string().max(4000),
      safetyDisclaimer: z.string().max(4000),
    }),
    req.body,
  );
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "deleted" } },
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, cleanHtml(v)])),
    { new: true },
  );
  if (!restaurant) throw new ApiError(404, "Restaurant not found");
  sendLegacy(res);
});
export const googleGeocode = catchAsync(async (req, res) => {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new ApiError(503, "Google Maps ist noch nicht konfiguriert.");
  const query = validate(
    z
      .object({
        address: z.string().trim().min(2).max(300).optional(),
        latlng: z
          .string()
          .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
          .refine((value) => {
            const [lat, lng] = value.split(",");
            return validCoordinate(lat, 90) && validCoordinate(lng, 180);
          }, "Invalid coordinates")
          .optional(),
      })
      .refine((v) => Boolean(v.address || v.latlng)),
    req.query,
  );
  const params = new URLSearchParams({ key, language: "de", ...query });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const result = await response.json();
  if (!["OK", "ZERO_RESULTS"].includes(result.status))
    throw new ApiError(502, "Google Maps Suche momentan nicht verfügbar.");
  sendLegacy(res, {
    data: (result.results || []).map((item) => ({
      address: item.formatted_address,
      latitude: item.geometry.location.lat,
      longitude: item.geometry.location.lng,
      city:
        item.address_components.find(
          (p) =>
            p.types.includes("locality") || p.types.includes("postal_town"),
        )?.long_name || "",
      country:
        item.address_components.find((p) => p.types.includes("country"))
          ?.long_name || "",
    })),
  });
});
