import express from 'express';
import { registerValidator, loginValidator, refreshValidator } from '../controllers/auth/auth.validators.js';
import validateRequest from '../middlewares/validateRequest.js';
import { register, login, refresh, logout, me } from '../controllers/auth/auth.controller.js';

const router = express.Router();

router.post('/register', registerValidator, validateRequest, register);
router.post('/login', loginValidator, validateRequest, login);
router.post('/refresh', refreshValidator, validateRequest, refresh);
router.post('/logout', logout);
router.get('/me', me);

export default router;