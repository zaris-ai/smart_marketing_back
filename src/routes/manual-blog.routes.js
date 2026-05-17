import express from 'express';

import {
    createManualBlog,
    deleteManualBlog,
    getManualBlogById,
    listManualBlogs,
    publishManualBlog,
    updateManualBlog,
} from '../controllers/manual-blog/manual-blog.controller.js';

const router = express.Router();

router.get('/', listManualBlogs);
router.post('/', createManualBlog);
router.get('/:id', getManualBlogById);
router.patch('/:id', updateManualBlog);
router.patch('/:id/publish', publishManualBlog);
router.delete('/:id', deleteManualBlog);

export default router;