// modules/bug/services/bugAttachment.service.js
const { BugAttachmentRepository } = require("../repositories/bugAttachment.repository");
const { BugService } = require("./bug.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { AppError } = require("../../../shared/errors/AppError");

const MAX_ATTACHMENTS_PER_BUG = 10;
const CLOUDINARY_FOLDER = "testmate/bugs";

class BugAttachmentService {
  static Instance = new BugAttachmentService();

  constructor(
    attachmentRepo = BugAttachmentRepository.Instance,
    bugService = BugService.Instance,
    storage = StorageService.Instance
  ) {
    this.attachmentRepo = attachmentRepo;
    this.bugService = bugService;
    this.storage = storage;
  }

  async listAttachments(actor, bugId) {
    await this.bugService.getAccessible(actor, bugId); // access check
    return this.attachmentRepo.findByBug(bugId);
  }

  // files: array of { buffer, originalname, mimetype, size } (multer memory files)
  async uploadAttachments(actor, bugId, files) {
    await this.bugService.getAccessible(actor, bugId);

    if (!files || files.length === 0) {
      throw new AppError("No files provided", 400);
    }

    const existing = await this.attachmentRepo.countByBug(bugId);
    if (existing + files.length > MAX_ATTACHMENTS_PER_BUG) {
      throw new AppError(`A bug can have at most ${MAX_ATTACHMENTS_PER_BUG} attachments`, 422);
    }

    const uploaded = [];
    for (const file of files) {
      const result = await this.storage.uploadImage(file.buffer, {
        folder: CLOUDINARY_FOLDER,
      });
      uploaded.push({
        bugId,
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

  async deleteAttachment(actor, bugId, attachmentId) {
    await this.bugService.getAccessible(actor, bugId);

    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.bugId !== bugId) {
      throw new AppError("Attachment not found", 404);
    }

    // Remove from Cloudinary first, then drop the metadata row.
    await this.storage.deleteImage(attachment.filePublicId).catch(() => {});
    await this.attachmentRepo.delete(attachment.id);
  }
}

module.exports = { BugAttachmentService };
