import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';

import auth from '../middlewares/auth.js';

import {
  createStore,
  listStores,
  getStoreById,
  updateStore,
  deleteStore,
  replaceStoresFromJson,
} from '../controllers/stores/stores.controller.js';

import {
  listStoreCrmActivities,
  createStoreCrmActivity,
  updateStoreCrmActivity,
  deleteStoreCrmActivity,
  analyzeStoreCrm,
  getLatestStoreCrmAnalysis,
  listStoreCrmAnalyses,
} from '../controllers/stores/storeCrm.controller.js';

const router = express.Router();

const importUploadDir = path.join(process.cwd(), 'uploads', 'imports');

fs.mkdirSync(importUploadDir, {
  recursive: true,
});

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, importUploadDir);
    },
    filename(req, file, cb) {
      const safeOriginalName = String(file.originalname || 'stores.json')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .toLowerCase();

      cb(null, `${Date.now()}-${safeOriginalName}`);
    },
  }),

  fileFilter(req, file, cb) {
    const isJson =
      file.mimetype === 'application/json' ||
      file.originalname.toLowerCase().endsWith('.json');

    if (!isJson) {
      cb(new Error('Only JSON files are allowed'));
      return;
    }

    cb(null, true);
  },
});

router.get('/', auth, listStores);
router.post('/', auth, createStore);

router.post('/replace-json', auth, upload.single('file'), replaceStoresFromJson);

router.get('/:storeId/crm-activities', auth, listStoreCrmActivities);
router.post('/:storeId/crm-activities', auth, createStoreCrmActivity);
router.patch(
  '/:storeId/crm-activities/:activityId',
  auth,
  updateStoreCrmActivity
);
router.delete(
  '/:storeId/crm-activities/:activityId',
  auth,
  deleteStoreCrmActivity
);

router.get('/:storeId/crm-analysis/latest', auth, getLatestStoreCrmAnalysis);
router.get('/:storeId/crm-analysis', auth, listStoreCrmAnalyses);
router.post('/:storeId/crm-analysis/run', auth, analyzeStoreCrm);

router.get('/:id', auth, getStoreById);
router.patch('/:id', auth, updateStore);
router.delete('/:id', auth, deleteStore);

export default router;