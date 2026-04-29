import { Router } from 'express';
import { createResearch } from '../controllers/research/research.controller.js';
import auth from '../middlewares/auth.js';

const router = Router();

router.post('/', auth, createResearch);

export default router;