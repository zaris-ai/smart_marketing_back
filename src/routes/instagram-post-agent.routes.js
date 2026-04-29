import { Router } from 'express';
import {
    createInstagramPostIdeas,
    deleteInstagramPostIdeaRun,
    getInstagramPostIdeaRunById,
    getInstagramPostIdeaRuns,
} from '../controllers/instagram-post-agent/instagram-post-agent.controller.js';

const router = Router();

router.get('/post-ideas', getInstagramPostIdeaRuns);
router.get('/post-ideas/:id', getInstagramPostIdeaRunById);
router.post('/post-ideas', createInstagramPostIdeas);
router.delete('/post-ideas/:id', deleteInstagramPostIdeaRun);

export default router;