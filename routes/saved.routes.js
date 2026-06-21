import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { protect } from '../middlewares/auth.js';
import { deleteSavedItem, listSavedItems, saveItem } from '../controllers/saved.controller.js';
import { deleteSavedItemSchema, saveItemSchema } from '../validations/saved.validation.js';

const router = Router();

router.use(protect);

router.get('/', listSavedItems);
router.post('/', validate(saveItemSchema), saveItem);
router.delete('/:type/:id', validate(deleteSavedItemSchema), deleteSavedItem);

export default router;
