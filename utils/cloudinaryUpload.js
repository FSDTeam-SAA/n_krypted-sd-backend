import { Readable } from 'stream';
import cloudinary from '../config/cloudinary.js';

export const streamUpload = (buffer, folder = 'express-uploads') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
};

export const toImageAsset = (result) => ({
  public_id: result.public_id,
  secure_url: result.secure_url,
  width: result.width,
  height: result.height,
  format: result.format,
  bytes: result.bytes
});

export const deleteCloudinaryImage = (publicId) => {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};
