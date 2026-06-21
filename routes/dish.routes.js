import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { optionalAuth } from '../middlewares/auth.js';
import { getDish } from '../controllers/dish.controller.js';
import { idParam } from '../validations/common.validation.js';

const router = Router();

router.get('/:id', optionalAuth, validate({ params: idParam }), getDish);

export default router;
