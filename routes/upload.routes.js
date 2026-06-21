import { Router } from 'express';
import upload from '../middlewares/upload.js';
import { deleteImage, uploadImage, uploadImages } from '../controllers/upload.controller.js';

const router = Router();

router.post('/', upload.single('image'), uploadImage);
router.post('/multiple', upload.array('images', 10), uploadImages);
router.delete('/', deleteImage);
router.delete('/:publicId', deleteImage);

export default router;
