import { Router } from 'express';
import upload from '../middlewares/upload.js';
import { protect } from '../middlewares/auth.js';
import { restrictTo } from '../middlewares/roles.js';
import { deleteImage, uploadImage, uploadImages } from '../controllers/upload.controller.js';

const router = Router();

router.use(protect);

router.post('/', upload.single('image'), uploadImage);
router.post('/multiple', upload.array('images', 10), uploadImages);
// Public IDs are exposed in image payloads, so deleting arbitrary assets is admin-only.
router.delete('/', restrictTo('admin'), deleteImage);
router.delete('/:publicId', restrictTo('admin'), deleteImage);

export default router;
