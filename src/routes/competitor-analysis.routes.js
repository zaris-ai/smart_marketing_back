import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  runCompetitorAnalysis,
  getLatestCompetitorAnalysis,
} from '../controllers/competitor/competitor-analysis.controller.js';

const router = Router();

router.get('/latest', getLatestCompetitorAnalysis);
router.get('/run', auth, runCompetitorAnalysis);

export default router;