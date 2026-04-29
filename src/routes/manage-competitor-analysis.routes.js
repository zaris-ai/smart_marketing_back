import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  createManageCompetitorAnalysis,
  getManageCompetitorAnalyses,
  getManageCompetitorAnalysisById,
  deleteManageCompetitorAnalysis,
} from '../controllers/manage-competitor/manage-competitor-analysis.controller.js';

const router = Router();

router.get('/', auth, getManageCompetitorAnalyses);
router.get('/:id', auth, getManageCompetitorAnalysisById);
router.post('/', auth, createManageCompetitorAnalysis);
router.delete('/:id', auth, deleteManageCompetitorAnalysis);

export default router;