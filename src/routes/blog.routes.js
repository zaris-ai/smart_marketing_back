import { Router } from 'express';
import {
  createBlog,
  getBlogById,
  listBlogs,
  updateBlog,
} from '../controllers/blog/blog.controller.js';
import auth from './../middlewares/auth.js';

const router = Router();

router.get('/', auth, listBlogs);
router.post('/', auth, createBlog);
router.get('/:id', auth, getBlogById);
router.patch('/:id', auth, updateBlog);

export default router;