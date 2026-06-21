import { Router } from 'express';
import upload from '../middlewares/upload.js';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { createReview, listReviews } from '../controllers/review.controller.js';
import { createReviewSchema, listReviewsSchema } from '../validations/review.validation.js';

const router = Router();

router.get('/', validate(listReviewsSchema), listReviews);
router.post('/', protect, upload.array('images', 5), validate(createReviewSchema), createReview);

export default router;
