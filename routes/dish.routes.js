import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { getDish } from '../controllers/dish.controller.js';
import { idParam } from '../validations/common.validation.js';

const router = Router();

router.get('/:id', validate({ params: idParam }), getDish);

export default router;
