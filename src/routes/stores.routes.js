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
  importStoresFromJson,
} from '../controllers/stores/stores.controller.js';

import {
  listStoreCrmActivities,
  createStoreCrmActivity,
  updateStoreCrmActivity,
  deleteStoreCrmActivity,
  analyzeStoreCrmActivities,
} from '../controllers/stores/storeCrm.controller.js';

import {
  bulkDiscoverStoreContacts,
  discoverContactsByUrl,
  discoverStoreContacts,
} from '../controllers/stores/storeContactDiscovery.controller.js';

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
    const originalName = String(file.originalname || '').toLowerCase();

    const isJson =
      file.mimetype === 'application/json' || originalName.endsWith('.json');

    if (!isJson) {
      cb(new Error('Only JSON files are allowed'));
      return;
    }

    cb(null, true);
  },
});

/**
 * Store routes
 */
router.get('/', auth, listStores);
router.post('/', auth, createStore);

/**
 * JSON append import
 *
 * Adds new stores only.
 * Existing stores are not deleted.
 * Duplicate domains are skipped.
 */
router.post('/import-json', auth, upload.single('file'), importStoresFromJson);

/**
 * Store CRM activity routes
 *
 * These routes must be before /:id routes.
 */
router.get('/:storeId/crm-activities', auth, listStoreCrmActivities);
router.post('/:storeId/crm-activities', auth, createStoreCrmActivity);

/**
 * Store CRM background analysis route
 *
 * Queues store_crm_analysis crew in BullMQ.
 * Keep this before /:id routes.
 */
router.post('/:storeId/crm-activities/analyze', auth, analyzeStoreCrmActivities);

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

/**
 * Single store routes
 *
 * Keep these after all custom /:storeId/... routes.
 */
router.get('/:id', auth, getStoreById);
router.patch('/:id', auth, updateStore);
router.delete('/:id', auth, deleteStore);


router.post('/discover-contacts', discoverContactsByUrl);
router.post('/discover-contacts/bulk', bulkDiscoverStoreContacts);
router.post('/:id/discover-contacts', discoverStoreContacts);

export default router;