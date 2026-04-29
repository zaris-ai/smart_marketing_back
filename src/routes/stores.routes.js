import express from 'express';
import auth from '../middlewares/auth.js';
import {
  createStore,
  listStores,
  getStoreById,
  updateStore,
  deleteStore,
} from '../controllers/stores/stores.controller.js';

const router = express.Router();

router.get('/', auth, listStores);
router.post('/', auth, createStore);
router.get('/:id', auth, getStoreById);
router.patch('/:id', auth, updateStore);
router.delete('/:id', auth, deleteStore);

export default router;