import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  getLatestStoreOutreach,
  runStoreOutreach,
} from '../controllers/store-outreach/store-outreach.controller.js';

const router = Router();

router.get('/latest', getLatestStoreOutreach);
router.post('/', auth, runStoreOutreach);

export default router;