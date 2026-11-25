import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const uploadsDir = join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage with timestamp + random suffix to prevent collisions & directory traversal
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `img-${uniqueSuffix}${ext}`);
  },
});

// File filter: accept images only (jpg, jpeg, png, webp)
const fileFilter = (_req, file, cb) => {
  const allowedMimetypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = extname(file.originalname).toLowerCase();

  if (allowedMimetypes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WEBP image files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
});

/* ──────────────────────────────────────────
   POST /api/upload  –  restaurant only
   Upload an image file using multipart/form-data
   Field name: 'image' or 'file'
   ────────────────────────────────────────── */
router.post(
  '/',
  authenticate,
  authorize('restaurant'),
  (req, res, next) => {
    // Accept either 'image' or 'file' form field
    const uploadMiddleware = upload.single('image');
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image size must be less than 5 MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded. Please provide an image file in the "image" field.' });
    }

    const relativePath = `/uploads/${req.file.filename}`;

    res.status(201).json({
      url: relativePath,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
);

export default router;
