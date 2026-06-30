// modules/testCase/services/testCaseAttachment.service.js
const {
  TestCaseAttachmentRepository,
} = require("../repositories/testCaseAttachment.repository");
const { TestCaseService } = require("./testCase.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { AppError } = require("../../../shared/errors/AppError");

const MAX_ATTACHMENTS_PER_CASE = 10;
const CLOUDINARY_FOLDER = "testmate/test-cases";

class TestCaseAttachmentService {
  static Instance = new TestCaseAttachmentService();

  constructor(
    attachmentRepo = TestCaseAttachmentRepository.Instance,
    testCaseService = TestCaseService.Instance,
    storage = StorageService.Instance
  ) {
    this.attachmentRepo = attachmentRepo;
    this.testCaseService = testCaseService;
    this.storage = storage;
  }

  async listAttachments(actor, testCaseId) {
    await this.testCaseService.getTestCase(actor, testCaseId); // access check
    return this.attachmentRepo.findByTestCase(testCaseId);
  }

  // files: array of { buffer, originalname, mimetype, size } (multer memory files)
  async uploadAttachments(actor, testCaseId, files) {
    await this.testCaseService.getTestCase(actor, testCaseId);

    if (!files || files.length === 0) {
      throw new AppError("No files provided", 400);
    }

    const existing = await this.attachmentRepo.countByTestCase(testCaseId);
    if (existing + files.length > MAX_ATTACHMENTS_PER_CASE) {
      throw new AppError(
        `A test case can have at most ${MAX_ATTACHMENTS_PER_CASE} attachments`,
        422
      );
    }

    const uploaded = [];
    for (const file of files) {
      const result = await this.storage.uploadImage(file.buffer, {
        folder: CLOUDINARY_FOLDER,
      });
      uploaded.push({
        testCaseId,
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

  async deleteAttachment(actor, testCaseId, attachmentId) {
    await this.testCaseService.getTestCase(actor, testCaseId);

    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.testCaseId !== testCaseId) {
      throw new AppError("Attachment not found", 404);
    }

    // Remove from Cloudinary first, then drop the metadata row.
    await this.storage.deleteImage(attachment.filePublicId).catch(() => {});
    await this.attachmentRepo.delete(attachment.id);
  }
}

module.exports = { TestCaseAttachmentService };
