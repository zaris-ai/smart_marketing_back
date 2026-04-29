import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  createProblemDiscoveryRun,
  getProblemDiscoveryRuns,
  getProblemDiscoveryRunById,
  deleteProblemDiscoveryRun,
} from '../controllers/problem-discovery/problem-discovery.controller.js';

const router = Router();

router.get('/', getProblemDiscoveryRuns);
router.get('/:id', getProblemDiscoveryRunById);
router.post('/', auth, createProblemDiscoveryRun);
router.delete('/:id', deleteProblemDiscoveryRun);

export default router;