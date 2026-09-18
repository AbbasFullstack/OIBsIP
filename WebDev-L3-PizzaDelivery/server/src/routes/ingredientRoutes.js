import { Router } from 'express';
import * as pizzaController from '../controllers/pizzaController.js';

const router = Router();

router.get('/', pizzaController.listIngredients);
router.get('/:id', pizzaController.getIngredient);

export default router;