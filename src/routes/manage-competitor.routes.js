import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  createManageCompetitor,
  getManageCompetitors,
  getManageCompetitorById,
  updateManageCompetitor,
  deleteManageCompetitor,
} from '../controllers/manage-competitor/manage-competitor.controller.js';

const router = Router();

router.get('/', auth, getManageCompetitors);
router.get('/:id', auth, getManageCompetitorById);
router.post('/', auth, createManageCompetitor);
router.patch('/:id', auth, updateManageCompetitor);
router.delete('/:id', auth, deleteManageCompetitor);

export default router;