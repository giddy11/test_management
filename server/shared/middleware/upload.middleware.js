// shared/middleware/upload.middleware.js
// multer factories. memoryStorage only — files never touch disk; buffers go straight to Cloudinary.
const multer = require("multer");
const { AppError } = require("../errors/AppError");

const memoryStorage = multer.memoryStorage();
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function imageFileFilter(_req, file, cb) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only PNG, JPEG, and WebP images are allowed", 422));
  }
}

function uploadSingle(field, maxMb = 5) {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: imageFileFilter,
  }).single(field);
}

function uploadMany(field, maxCount = 10, maxMb = 5) {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: maxMb * 1024 * 1024, files: maxCount },
    fileFilter: imageFileFilter,
  }).array(field, maxCount);
}

module.exports = { uploadSingle, uploadMany, ALLOWED_IMAGE_TYPES };
