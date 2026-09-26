// modules/testCase/services/testCaseAttachment.service.js
const {
  TestCaseAttachmentRepository,
} = require("../repositories/testCaseAttachment.repository");
const { TestCaseService } = require("./testCase.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { AppError } = require("../../../shared/errors/AppError");
const { TestRunResultRepository } = require("../../testRunResult/repositories/testRunResult.repository");
const { TestRunResultService } = require("../../testRunResult/services/testRunResult.service");

const MAX_ATTACHMENTS_PER_CASE = 10;
const MAX_ATTACHMENTS_PER_RESULT = 10;
const CLOUDINARY_FOLDER = "testmate/test-cases";

class TestCaseAttachmentService {
  static Instance = new TestCaseAttachmentService();

  constructor(
    attachmentRepo = TestCaseAttachmentRepository.Instance,
    testCaseService = TestCaseService.Instance,
    storage = StorageService.Instance,
    resultRepo = TestRunResultRepository.Instance,
    resultService = TestRunResultService.Instance
  ) {
    this.attachmentRepo = attachmentRepo;
    this.testCaseService = testCaseService;
    this.storage = storage;
    this.resultRepo = resultRepo;
    this.resultService = resultService;
  }

  async listAttachments(actor, testCaseId) {
    await this.testCaseService.getTestCase(actor, testCaseId); // access check
    return this.attachmentRepo.findByTestCase(testCaseId);
  }

  // files: array of { buffer, originalname, mimetype, size } (multer memory files)
  async uploadAttachments(actor, testCaseId, files) {
    const tc = await this.testCaseService.getTestCase(actor, testCaseId);
    await this.testCaseService.assertCanContribute(actor, tc);

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

  // The three run-result methods below used to look the result up by id and
  // stop: no check that the caller could see the project it belongs to, so the
  // only barrier was a route guard that knew nothing about organisations.
  // resultService applies the project access check (and, for a tester, the
  // assigned-cases restriction) exactly as it does for the result itself.
  async listRunResultAttachments(actor, runResultId) {
    await this.resultService.getResult(actor, runResultId);
    return this.attachmentRepo.findByRunResult(runResultId);
  }

  async uploadRunResultAttachments(actor, runResultId, files) {
    const result = await this.resultService.getResultForContribution(actor, runResultId);

    if (!files || files.length === 0) throw new AppError("No files provided", 400);

    const existing = await this.attachmentRepo.countByRunResult(runResultId);
    if (existing + files.length > MAX_ATTACHMENTS_PER_RESULT) {
      throw new AppError(`A test run result can have at most ${MAX_ATTACHMENTS_PER_RESULT} attachments`, 422);
    }

    const uploaded = [];
    for (const file of files) {
      const res = await this.storage.uploadImage(file.buffer, { folder: CLOUDINARY_FOLDER });
      uploaded.push({
        testCaseId: result.testCaseId,
        runResultId,
        fileName: file.originalname,
        fileUrl: res.url,
        filePublicId: res.publicId,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById: actor.id,
      });
    }
    return this.attachmentRepo.createMany(uploaded);
  }

  async deleteRunResultAttachment(actor, runResultId, attachmentId) {
    await this.resultService.getResultForContribution(actor, runResultId);
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.runResultId !== runResultId) {
      throw new AppError("Attachment not found", 404);
    }
    await this.storage.deleteImage(attachment.filePublicId).catch(() => {});
    await this.attachmentRepo.delete(attachment.id);
  }

  async deleteAttachment(actor, testCaseId, attachmentId) {
    const tc = await this.testCaseService.getTestCase(actor, testCaseId);
    await this.testCaseService.assertCanContribute(actor, tc);

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
