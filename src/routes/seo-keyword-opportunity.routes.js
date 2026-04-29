import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  createSeoKeywordOpportunity,
  getLatestSeoKeywordOpportunity,
} from '../controllers/seo-keyword-opportunity/seo-keyword-opportunity.controller.js';

const router = Router();

router.get('/latest', getLatestSeoKeywordOpportunity);
router.post('/', auth, createSeoKeywordOpportunity);

export default router;