import { Router } from 'express';

import {
  createResearch,
  deleteResearch,
  getResearchById,
  getResearchByRunId,
  listResearch,
} from '../controllers/research/research.controller.js';
import auth from '../middlewares/auth.js';

const router = Router();

router.get('/', auth, listResearch);
router.post('/', auth, createResearch);

router.get('/run/:runId', auth, getResearchByRunId);

router.get('/:id', auth, getResearchById);
router.delete('/:id', auth, deleteResearch);

export default router;