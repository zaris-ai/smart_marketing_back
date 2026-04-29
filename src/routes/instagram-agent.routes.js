import { Router } from 'express';
import {
    createInstagramStoryIdeas,
    deleteInstagramStoryIdeaRun,
    getInstagramStoryIdeaRunById,
    getInstagramStoryIdeaRuns,
} from '../controllers/instagram-agent/instagram-agent.controller.js';

const router = Router();

router.get('/story-ideas', getInstagramStoryIdeaRuns);
router.get('/story-ideas/:id', getInstagramStoryIdeaRunById);
router.post('/story-ideas', createInstagramStoryIdeas);
router.delete('/story-ideas/:id', deleteInstagramStoryIdeaRun);

export default router;