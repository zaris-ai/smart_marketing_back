import { Router } from 'express';
import {
  gmailAuthUrl,
  gmailOAuthCallback,
  listMyEmails,
  listMyLabels,
  getMyEmailById,
  getMyThreadById,
  analyzeMyEmailById,
} from '../controllers/gmail/gmail.controller.js';

const router = Router();

router.get('/auth-url', gmailAuthUrl);
router.get('/oauth2/callback', gmailOAuthCallback);

router.get('/messages', listMyEmails);
router.get('/labels', listMyLabels);
router.get('/messages/:id', getMyEmailById);
router.post('/messages/:id/analyze', analyzeMyEmailById);

router.get('/threads/:threadId', getMyThreadById);

export default router;