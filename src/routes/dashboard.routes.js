import { Router } from 'express';
import {
  generateDashboard,
  getLatestDashboard,
} from '../controllers/dashboard/dashboard.controller.js';
import auth from '../middlewares/auth.js';

const router = Router();

router.get('/', getLatestDashboard);
router.post('/generate', auth, generateDashboard);

export default router;