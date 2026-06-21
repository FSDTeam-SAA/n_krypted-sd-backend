import { StatusCodes } from 'http-status-codes';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import sendSuccess from '../utils/apiResponse.js';
import { deleteCloudinaryImage, streamUpload, toImageAsset } from '../utils/cloudinaryUpload.js';

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Please upload an image file');
  }

  const folder = req.body.folder || 'express-uploads';
  const result = await streamUpload(req.file.buffer, folder);

  sendSuccess(res, StatusCodes.CREATED, 'Image uploaded successfully', toImageAsset(result));
});

export const uploadImages = catchAsync(async (req, res) => {
  if (!req.files?.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Please upload at least one image file');
  }

  const folder = req.body.folder || 'express-uploads';
  const images = await Promise.all(
    req.files.map(async (file) => toImageAsset(await streamUpload(file.buffer, folder)))
  );

  sendSuccess(res, StatusCodes.CREATED, 'Images uploaded successfully', { images });
});

export const deleteImage = catchAsync(async (req, res) => {
  const publicId = req.params.publicId || req.query.publicId || req.body.publicId;

  if (!publicId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'publicId is required');
  }

  const result = await deleteCloudinaryImage(publicId);

  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Failed to delete image from Cloudinary');
  }

  sendSuccess(res, StatusCodes.OK, 'Image delete request processed successfully', result);
});
