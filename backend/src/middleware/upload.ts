import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';

const PRODUCTS_DIR = path.join(env.UPLOAD_DIR, 'products');
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PRODUCTS_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXTENSION_BY_MIME[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSION_BY_MIME[file.mimetype]) {
      cb(badRequest('Only JPG and PNG images are allowed.'));
      return;
    }
    cb(null, true);
  },
}).single('image');

/** Wraps multer's callback style so upload failures reach the error middleware as an AppError. */
export const uploadProductImage: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(badRequest(`Image must be ${env.MAX_UPLOAD_MB}MB or smaller.`));
      return;
    }
    next(err);
  });
};

/** Public URL path for a file saved under uploads/products/. Served by express.static at /uploads. */
export function productImageUrl(filename: string): string {
  return `/uploads/products/${filename}`;
}

const IMPORT_MIME = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const IMPORT_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMPORT_MIME.has(file.mimetype) && !IMPORT_EXTENSIONS.has(ext)) {
      cb(badRequest('Only CSV or Excel (.xlsx/.xls) files are allowed.'));
      return;
    }
    cb(null, true);
  },
}).single('file');

/** Bulk-import spreadsheet upload, kept in memory — never written to disk. */
export const uploadImportFile: RequestHandler = (req, res, next) => {
  importUpload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(badRequest('Import file must be 10MB or smaller.'));
      return;
    }
    next(err);
  });
};
