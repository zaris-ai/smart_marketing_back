import express from 'express';
import auth from '../middlewares/auth.js';
import validateRequest from '../middlewares/validateRequest.js';
import {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from '../controllers/users/users.controller.js';
import {
  createAdminValidator,
  updateAdminValidator,
} from '../controllers/users/users.validators.js';

const router = express.Router();

router.get('/admins', auth, getAdmins);
router.post('/admins', auth, createAdminValidator, validateRequest, createAdmin);
router.put('/admins/:id', auth, updateAdminValidator, validateRequest, updateAdmin);
router.delete('/admins/:id', auth, deleteAdmin);

export default router;