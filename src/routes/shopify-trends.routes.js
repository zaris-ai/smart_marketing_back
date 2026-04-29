import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  getLatestShopifyTrends,
  runShopifyTrends,
} from '../controllers/shopify-trends/shopify-trends.controller.js';

const router = Router();

router.get('/latest', getLatestShopifyTrends);
router.post('/run', auth, runShopifyTrends);

export default router;