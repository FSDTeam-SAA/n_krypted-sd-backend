import { Router } from 'express';
import { listCategories } from '../controllers/restaurant.controller.js';

const router = Router();

router.get('/', listCategories);

export default router;
