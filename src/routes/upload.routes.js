import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  uploadImage,
  listUploadedImages,
  deleteUploadedImage,
} from '../controllers/upload/upload.controller.js';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'images');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Only jpg, png, webp, and gif images are allowed'));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.get('/images', listUploadedImages);
router.post('/image', upload.single('image'), uploadImage);
router.delete('/images/:id', deleteUploadedImage);

export default router;