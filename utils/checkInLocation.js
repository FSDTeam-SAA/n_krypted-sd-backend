import { StatusCodes } from 'http-status-codes';
import ApiError from './ApiError.js';

export const validCoordinate = (value, max) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max;

export const verifyCheckInLocation = (location, rawLatitude, rawLongitude) => {
  if (!validCoordinate(rawLatitude, 90) || !validCoordinate(rawLongitude, 180)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Bitte einen gültigen GPS-Standort übermitteln.');
  }
  const coordinates = location?.coordinates;
  if (coordinates?.length !== 2 || !validCoordinate(coordinates[0], 180) || !validCoordinate(coordinates[1], 90)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Der Betreiber muss zuerst den Restaurantstandort hinterlegen.');
  }
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(coordinates[1] - latitude);
  const deltaLng = radians(coordinates[0] - longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(coordinates[1])) * Math.sin(deltaLng / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, a));
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
  if (distance > 100) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Ein Check-in ist nur innerhalb von 100 Metern zum Restaurant möglich.');
  }
  return { latitude, longitude, distance };
};
