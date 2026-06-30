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

const ALLOWED_SHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (some browsers send this for .xlsx)
  "application/octet-stream",
];

function sheetFileFilter(_req, file, cb) {
  const okType = ALLOWED_SHEET_TYPES.includes(file.mimetype);
  const okExt = /\.xlsx?$/i.test(file.originalname || "");
  if (okType || okExt) {
    cb(null, true);
  } else {
    cb(new AppError("Only .xlsx spreadsheet files are allowed", 422));
  }
}

function uploadSpreadsheet(field, maxMb = 5) {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: sheetFileFilter,
  }).single(field);
}

module.exports = {
  uploadSingle,
  uploadMany,
  uploadSpreadsheet,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_SHEET_TYPES,
};
