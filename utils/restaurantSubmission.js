import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import ApiError from './ApiError.js';
import { dishInput, parseJson, parseStringArray, uploadedImages } from './legacyApi.js';
import { validCoordinate } from './checkInLocation.js';

const categories = ['interior', 'exterior', 'other'];
const signatureSchema = z.array(z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  price: z.coerce.number().finite().min(0),
  category: z.string().optional(),
  specialtyDescription: z.string().optional(),
  ingredients: z.array(z.string()).optional(),
  preparationProcess: z.string().optional(),
  imageIndexes: z.array(z.number().int().min(0)).min(1).max(4)
})).min(1).max(3);

export const validateRestaurantLocation = (body) => {
  const location = parseJson(body.location, null);
  if (!location || !validCoordinate(location.latitude, 90) || !validCoordinate(location.longitude, 180)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte den Restaurantstandort auf der Karte bestätigen.');
  }
};

export const prepareRestaurantSubmission = async (req, restaurantId) => {
  validateRestaurantLocation(req.body);
  const files = req.files || [];
  const count = Number(req.body.restaurantImageCount);
  const parsed = signatureSchema.safeParse(parseJson(req.body.signatureDishes, null));
  if (!parsed.success) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte 1 bis 3 Signature-Gerichte mit Beschreibung, Preis und jeweils 1 bis 4 Fotos hinzufügen.');
  }
  if (!Number.isInteger(count) || count < 2 || count > 12 || count > files.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte Restaurantfotos getrennt von Gerichtsfotos hochladen.');
  }
  const photoCategories = parseJson(req.body.photoCategories, null);
  if (!Array.isArray(photoCategories) || photoCategories.length !== count ||
      photoCategories.some((category) => !categories.includes(category)) ||
      !photoCategories.includes('interior') || !photoCategories.includes('exterior') ||
      categories.some((category) => photoCategories.filter((item) => item === category).length > 4) ||
      parseStringArray(req.body.existingImages).length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte mindestens ein Innen- und Außenfoto hinzufügen (maximal 4 Fotos pro Bereich).');
  }
  const indexes = parsed.data.flatMap((dish) => dish.imageIndexes);
  if (indexes.length !== files.length - count || new Set(indexes).size !== indexes.length ||
      indexes.some((index) => index < count || index >= files.length)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte jedem Signature-Gericht eigene Fotos zuordnen.');
  }
  // Validate the complete submission before starting any uploads or DB writes.
  const images = await uploadedImages(files, `restaurants/${restaurantId}`);
  return {
    gallery: images.slice(0, count).map((image, index) => ({ ...image, category: photoCategories[index] })),
    dishes: parsed.data.map((dish) => ({
      ...dishInput({ ...dish, isSignatureDish: true }),
      restaurant: restaurantId,
      images: dish.imageIndexes.map((index) => images[index]),
      status: 'active'
    }))
  };
};

export const categorizeRestaurantImages = (body, images) => {
  if (body.photoCategories === undefined) return images;
  const values = parseJson(body.photoCategories, null);
  if (!Array.isArray(values) || values.length !== images.length ||
      values.some((value) => !categories.includes(value)) ||
      categories.some((category) => values.filter((value) => value === category).length > 4)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Ungültige Fotobereiche. Maximal 4 Fotos pro Bereich.');
  }
  return images.map((image, index) => ({ ...image, category: values[index] }));
};

export const validateSignatureDish = async (Dish, restaurantId, updates, dishId) => {
  if (!updates.isSignature) return;
  if (!updates.description?.trim()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte das Signature-Gericht beschreiben.');
  }
  const filters = { restaurant: restaurantId, isSignature: true, status: { $ne: 'deleted' } };
  if (dishId) filters._id = { $ne: dishId };
  if (await Dish.countDocuments(filters) >= 3) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Maximal 3 Signature-Gerichte pro Restaurant.');
  }
};
