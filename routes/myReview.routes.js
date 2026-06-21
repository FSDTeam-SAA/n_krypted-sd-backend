import { Router } from 'express';
import { protect } from '../middlewares/auth.js';
import validate from '../middlewares/validate.js';
import { listMyReviews } from '../controllers/review.controller.js';
import { paginationQuery } from '../validations/common.validation.js';

const router = Router();

router.use(protect);
router.get('/', validate({ query: paginationQuery }), listMyReviews);

export default router;
