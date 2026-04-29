import { Router } from 'express';
import auth from '../middlewares/auth.js';
import {
  createAiBlog,
  getAiBlogs,
  getAiBlogById,
  updateAiBlog,
  publishAiBlog,
  unpublishAiBlog,
  deleteAiBlog,
} from '../controllers/ai-blog/ai-blog.controller.js';

const router = Router();

router.get('/', getAiBlogs);
router.get('/:id', getAiBlogById);

router.post('/', auth, createAiBlog);
router.patch('/:id', auth, updateAiBlog);
router.patch('/:id/publish', auth, publishAiBlog);
router.patch('/:id/unpublish', auth, unpublishAiBlog);
router.delete('/:id', auth, deleteAiBlog);

export default router;