import express from 'express';

import auth from '../middlewares/auth.js';
import {
  cancelBackgroundRunById,
  deleteBackgroundRunById,
  getBackgroundRunById,
  listBackgroundRuns,
} from '../controllers/background-runs/background-runs.controller.js';

const router = express.Router();

router.get('/', auth, listBackgroundRuns);
router.get('/:id', auth, getBackgroundRunById);
router.patch('/:id/cancel', auth, cancelBackgroundRunById);
router.delete('/:id', auth, deleteBackgroundRunById);

export default router;