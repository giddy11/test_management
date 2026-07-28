// shared/services/storage.service.js
// The only layer that talks to Cloudinary. Controllers/repositories never call it directly.
const { cloudinary } = require("../../infrastructure/storage/cloudinaryClient");
const { AppError } = require("../errors/AppError");

class StorageService {
  static Instance = new StorageService();
  constructor() {}

  // Streams a buffer to Cloudinary. Returns the CDN url + publicId (needed for deletes).
  async uploadImage(buffer, options) {
    const maxDimension = options.maxDimension ?? 2000;
    const uploadOptions = {
      folder: options.folder,
      public_id: options.publicId,
      resource_type: "image",
      overwrite: true,
      transformation: options.transformation ?? [
        { width: maxDimension, height: maxDimension, crop: "limit" },
        { quality: "auto", fetch_format: "auto" },
      ],
    };

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error || !result) {
          reject(new AppError("File upload failed", 500));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      });
      stream.end(buffer);
    });
  }

  // Non-image files (PDF/Word/Excel/etc.) — Cloudinary stores these under a
  // separate "raw" resource type, with no image transformations applied.
  async uploadRaw(buffer, options) {
    const uploadOptions = {
      folder: options.folder,
      public_id: options.publicId,
      resource_type: "raw",
      overwrite: true,
    };

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error || !result) {
          reject(new AppError("File upload failed", 500));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        });
      });
      stream.end(buffer);
    });
  }

  async deleteImage(publicId) {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  }

  // Upload new → then delete old. A failed upload never leaves the record imageless.
  async replaceImage(buffer, options, oldPublicId) {
    const result = await this.uploadImage(buffer, options);
    if (oldPublicId && oldPublicId !== result.publicId) {
      await this.deleteImage(oldPublicId).catch(() => {});
    }
    return result;
  }
}

module.exports = { StorageService };
