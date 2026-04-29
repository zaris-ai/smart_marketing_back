import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  runSeoAudit,
  getLatestSeoAudit,
} from '../controllers/seo-audit/seo-audit.controller.js';

const router = Router();

router.get('/latest', getLatestSeoAudit);
router.post('/run', auth, runSeoAudit);

export default router;