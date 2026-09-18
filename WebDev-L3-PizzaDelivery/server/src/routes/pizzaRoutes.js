import { Router } from 'express';
import * as pizzaController from '../controllers/pizzaController.js';

const router = Router();

// Public catalog. No auth: the menu and builder are browsable before sign-up.
router.get('/', pizzaController.listPizzas);
router.get('/:id', pizzaController.getPizza);

export default router;