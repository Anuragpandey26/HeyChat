import multer from 'multer';
import { AppError } from '../../core/errors/AppError.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/webm',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPEG, PNG, GIF, WEBP images, PDFs, and MP4/MPEG/Quicktime/WEBM videos are allowed.',
        400
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB general cap
  },
});

export const uploadSingle = (fieldName) => upload.single(fieldName);
