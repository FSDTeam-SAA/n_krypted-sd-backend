import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { getPage } from '../controllers/page.controller.js';
import { slugParam } from '../validations/common.validation.js';

const router = Router();

router.get('/:slug', validate({ params: slugParam }), getPage);

export default router;
