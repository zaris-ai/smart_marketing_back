import { Router } from 'express';
import {
  gmailAuthUrl,
  gmailOAuthCallback,
  listMyEmails,
  listMyLabels,
  getMyEmailById,
  getMyThreadById,
  analyzeMyEmailById,
  saveMyEmailById,
  listSavedMyEmails,
  getSavedMyEmailById,
  updateSavedMyEmailById,
  deleteSavedMyEmailById,
} from '../controllers/gmail/gmail.controller.js';

const router = Router();

router.get('/auth-url', gmailAuthUrl);
router.get('/oauth2/callback', gmailOAuthCallback);

router.get('/messages', listMyEmails);
router.get('/labels', listMyLabels);
router.get('/messages/:id', getMyEmailById);
router.post('/messages/:id/save', saveMyEmailById);
router.post('/messages/:id/analyze', analyzeMyEmailById);

router.get('/threads/:threadId', getMyThreadById);

router.get('/saved', listSavedMyEmails);
router.get('/saved/:id', getSavedMyEmailById);
router.patch('/saved/:id', updateSavedMyEmailById);
router.delete('/saved/:id', deleteSavedMyEmailById);

export default router;