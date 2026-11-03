import { StatusCodes } from "http-status-codes";
import ApiError from "./ApiError.js";
import { streamUpload, toImageAsset } from "./cloudinaryUpload.js";
import { externalImageAsset, legacyRestaurant } from "./legacySerializers.js";
import Dish from "../models/dish.model.js";
import Promotion from "../models/promotion.model.js";
import { z } from "zod";
import { cleanHtml, openingHoursSchema, validate } from "./content.js";

export const sendLegacy = (
  res,
  payload = {},
  statusCode = StatusCodes.OK,
  message = "Success",
) => {
  res.status(statusCode).json({ success: true, message, ...payload });
};

export const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const parseStringArray = (value) => {
  const parsed = parseJson(value, value);
  if (Array.isArray(parsed))
    return parsed
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  return typeof parsed === "string"
    ? parsed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
};

export const uploadedImages = async (
  files = [],
  folder,
  existing = [],
  storedImages = [],
) => {
  const storedByUrl = new Map(
    storedImages.map((image) => [image.secure_url, image]),
  );
  const retained = parseStringArray(existing).map((url, index) => {
    const image = storedByUrl.get(url);
    return image
      ? typeof image.toObject === "function"
        ? image.toObject()
        : image
      : externalImageAsset(url, index);
  });
  if (!files.length) return retained;
  const added = await Promise.all(
    files.map(async (file) =>
      toImageAsset(await streamUpload(file.buffer, folder)),
    ),
  );
  return [...retained, ...added];
};

export const locationFields = (rawLocation) => {
  const location = parseJson(rawLocation, {}) || {};
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  return {
    address: location.address || "",
    city: location.city || "",
    country: location.country || "",
    ...(Number.isFinite(latitude) &&
      Number.isFinite(longitude) && {
        location: { type: "Point", coordinates: [longitude, latitude] },
      }),
  };
};

export const restaurantInput = (body = {}) => ({
  ...(body.title !== undefined && { name: body.title }),
  ...(body.shortDescription !== undefined && {
    shortDescription: body.shortDescription,
  }),
  ...(body.description !== undefined && {
    description: cleanHtml(body.description),
  }),
  ...(body.contactEmail !== undefined && {
    email: validate(
      z.union([z.literal(""), z.string().trim().email()]),
      body.contactEmail,
    ),
  }),
  ...(body.contactPhone !== undefined && { phone: body.contactPhone }),
  ...(body.openingHours !== undefined && {
    openingHours: validate(
      openingHoursSchema,
      parseJson(body.openingHours, null),
    ),
  }),
  ...(body.timeZone !== undefined && {
    timeZone: validateTimeZone(body.timeZone),
  }),
  ...(body.priceRange !== undefined && { priceRange: body.priceRange }),
  ...(body.leadImage !== undefined && { leadImage: body.leadImage }),
  ...(body.showTeamReviews !== undefined && {
    showTeamReviews:
      body.showTeamReviews === true || body.showTeamReviews === "true",
  }),
  ...((body.categories !== undefined || body.category !== undefined) && {
    categories: validatedStringList(body.categories ?? body.category),
  }),
  ...(body.offers !== undefined && { offers: parseStringArray(body.offers) }),
  ...(body.opensAt !== undefined && {
    opensAt: body.opensAt ? new Date(body.opensAt) : undefined,
  }),
  ...(body.reservationRequired !== undefined && {
    reservationRequired:
      body.reservationRequired === true || body.reservationRequired === "true",
  }),
  ...(body.location !== undefined && locationFields(body.location)),
});

const validateTimeZone = (value) => {
  const zone = validate(z.string().trim().min(1).max(100), value);
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return zone;
  } catch {
    throw new ApiError(400, "Invalid time zone");
  }
};

const validatedStringList = (value) => {
  const raw =
    typeof value === "string"
      ? parseJson(
          value,
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        )
      : value;
  return [
    ...new Set(
      validate(z.array(z.string().trim().min(1).max(120)).max(60), raw),
    ),
  ];
};

const nonnegativePrice = (value) =>
  validate(
    z
      .union([z.number(), z.string().trim().min(1)])
      .transform(Number)
      .refine(
        (price) => Number.isFinite(price) && price >= 0,
        "Price must be a nonnegative number",
      ),
    value,
  );

export const dishInput = (body = {}) => ({
  ...(body.name !== undefined && { name: body.name }),
  ...(body.description !== undefined && {
    description: cleanHtml(body.description),
  }),
  ...(body.tags !== undefined && { tags: validatedStringList(body.tags) }),
  ...(body.leadImage !== undefined && { leadImage: body.leadImage }),
  ...(body.price !== undefined && { price: nonnegativePrice(body.price) }),
  ...(body.category !== undefined && { category: body.category }),
  ...(body.specialtyDescription !== undefined && {
    specialtyDescription: body.specialtyDescription,
  }),
  ...(body.ingredients !== undefined && {
    ingredients: parseStringArray(body.ingredients),
  }),
  ...(body.preparationProcess !== undefined && {
    preparationMethod: body.preparationProcess,
  }),
  ...(body.isSignatureDish !== undefined && {
    isSignature:
      body.isSignatureDish === true || body.isSignatureDish === "true",
  }),
  ...(body.isActive !== undefined && {
    status:
      body.isActive === true || body.isActive === "true"
        ? "active"
        : "inactive",
  }),
});

export const populateLegacyRestaurants = async (restaurants) => {
  const ids = restaurants.map((restaurant) => restaurant._id);
  const dishes = await Dish.find({
    restaurant: { $in: ids },
    status: { $ne: "deleted" },
  });
  const now = new Date();
  const promotions = await Promotion.find({
    restaurant: { $in: ids },
    active: true,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  }).lean();
  const byRestaurant = new Map();
  dishes.forEach((dish) => {
    const key = String(dish.restaurant);
    byRestaurant.set(key, [...(byRestaurant.get(key) || []), dish]);
  });
  const activeDishIds = new Set(
    dishes
      .filter((dish) => dish.status === "active")
      .map((dish) => String(dish._id)),
  );
  return restaurants.map((restaurant) => ({
    ...legacyRestaurant(
      restaurant,
      byRestaurant.get(String(restaurant._id)) || [],
    ),
    promotions: promotions.filter(
      (item) =>
        String(item.restaurant) === String(restaurant._id) &&
        (!item.dish || activeDishIds.has(String(item.dish))),
    ),
  }));
};

export const assertOwnerOrAdmin = (user, restaurant) => {
  if (
    user.role !== "admin" &&
    String(restaurant.owner?._id || restaurant.owner) !== String(user._id)
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You cannot manage this restaurant",
    );
  }
};
