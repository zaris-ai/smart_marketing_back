import { Router } from 'express';
import { createBlog } from '../controllers/blog/blog.controller.js';
import auth from './../middlewares/auth.js'

const router = Router();

router.post('/', auth, createBlog);

export default router;