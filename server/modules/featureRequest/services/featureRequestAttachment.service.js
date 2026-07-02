// modules/featureRequest/services/featureRequestAttachment.service.js
const {
  FeatureRequestAttachmentRepository,
} = require("../repositories/featureRequestAttachment.repository");
const { FeatureRequestService } = require("./featureRequest.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { AppError } = require("../../../shared/errors/AppError");

const MAX_ATTACHMENTS_PER_REQUEST = 10;
const CLOUDINARY_FOLDER = "testmate/feature-requests";

class FeatureRequestAttachmentService {
  static Instance = new FeatureRequestAttachmentService();

  constructor(
    attachmentRepo = FeatureRequestAttachmentRepository.Instance,
    featureRequestService = FeatureRequestService.Instance,
    storage = StorageService.Instance
  ) {
    this.attachmentRepo = attachmentRepo;
    this.featureRequestService = featureRequestService;
    this.storage = storage;
  }

  async listAttachments(actor, featureRequestId) {
    await this.featureRequestService.getAccessible(actor, featureRequestId); // access check
    return this.attachmentRepo.findByFeatureRequest(featureRequestId);
  }

  // files: array of { buffer, originalname, mimetype, size } (multer memory files)
  async uploadAttachments(actor, featureRequestId, files) {
    await this.featureRequestService.getAccessible(actor, featureRequestId);

    if (!files || files.length === 0) {
      throw new AppError("No files provided", 400);
    }

    const existing = await this.attachmentRepo.countByFeatureRequest(featureRequestId);
    if (existing + files.length > MAX_ATTACHMENTS_PER_REQUEST) {
      throw new AppError(
        `A feature request can have at most ${MAX_ATTACHMENTS_PER_REQUEST} attachments`,
        422
      );
    }

    const uploaded = [];
    for (const file of files) {
      const result = await this.storage.uploadImage(file.buffer, {
        folder: CLOUDINARY_FOLDER,
      });
      uploaded.push({
        featureRequestId,
        fileName: file.originalname,
        fileUrl: result.url,
        filePublicId: result.publicId,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById: actor.id,
      });
    }

    return this.attachmentRepo.createMany(uploaded);
  }

  async deleteAttachment(actor, featureRequestId, attachmentId) {
    await this.featureRequestService.getAccessible(actor, featureRequestId);

    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.featureRequestId !== featureRequestId) {
      throw new AppError("Attachment not found", 404);
    }

    // Remove from Cloudinary first, then drop the metadata row.
    await this.storage.deleteImage(attachment.filePublicId).catch(() => {});
    await this.attachmentRepo.delete(attachment.id);
  }
}

module.exports = { FeatureRequestAttachmentService };
