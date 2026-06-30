// modules/testCase/tests/testCaseAttachment.service.spec.js
const {
  TestCaseAttachmentService,
} = require("../services/testCaseAttachment.service");

function makeAttachmentRepo() {
  return {
    findByTestCase: jest.fn(),
    findById: jest.fn(),
    countByTestCase: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    createMany: jest.fn().mockImplementation(async (rows) => rows),
    delete: jest.fn(),
  };
}

function makeTestCaseService() {
  return { getTestCase: jest.fn().mockResolvedValue({ id: "tc-1", suiteId: "s-1" }) };
}

function makeStorage() {
  return {
    uploadImage: jest
      .fn()
      .mockResolvedValue({ url: "https://cdn/x.png", publicId: "testmate/test-cases/x" }),
    deleteImage: jest.fn().mockResolvedValue(undefined),
  };
}

function file(name = "shot.png") {
  return {
    buffer: Buffer.from("img"),
    originalname: name,
    mimetype: "image/png",
    size: 1234,
  };
}

const actor = { id: "owner-1", role: "admin", organizationId: "org-1" };
describe("TestCaseAttachmentService", () => {
  let repo;
  let tcService;
  let storage;
  let service;

  beforeEach(() => {
    repo = makeAttachmentRepo();
    tcService = makeTestCaseService();
    storage = makeStorage();
    service = new TestCaseAttachmentService(repo, tcService, storage);
  });

  describe("uploadAttachments", () => {
    it("uploads each file to Cloudinary and persists metadata", async () => {
      const result = await service.uploadAttachments(actor, "tc-1", [file("a.png"), file("b.png")]);

      expect(tcService.getTestCase).toHaveBeenCalledWith(actor, "tc-1");
      expect(storage.uploadImage).toHaveBeenCalledTimes(2);
      const rows = repo.createMany.mock.calls[0][0];
      expect(rows[0]).toMatchObject({
        testCaseId: "tc-1",
        fileUrl: "https://cdn/x.png",
        filePublicId: "testmate/test-cases/x",
        mimeType: "image/png",
        uploadedById: "owner-1",
      });
      expect(result).toHaveLength(2);
    });

    it("throws 400 when no files are provided", async () => {
      await expect(service.uploadAttachments(actor, "tc-1", [])).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("throws 422 when the 10-attachment cap would be exceeded", async () => {
      repo.countByTestCase.mockResolvedValue(9);
      await expect(
        service.uploadAttachments(actor, "tc-1", [file(), file()])
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(storage.uploadImage).not.toHaveBeenCalled();
    });
  });

  describe("listAttachments", () => {
    it("checks access then returns the rows", async () => {
      repo.findByTestCase.mockResolvedValue([{ id: "att-1" }]);
      const items = await service.listAttachments(actor, "tc-1");
      expect(tcService.getTestCase).toHaveBeenCalledWith(actor, "tc-1");
      expect(items).toHaveLength(1);
    });
  });

  describe("deleteAttachment", () => {
    it("removes the Cloudinary asset then the DB row", async () => {
      repo.findById.mockResolvedValue({
        id: "att-1",
        testCaseId: "tc-1",
        filePublicId: "testmate/test-cases/x",
      });
      await service.deleteAttachment(actor, "tc-1", "att-1");
      expect(storage.deleteImage).toHaveBeenCalledWith("testmate/test-cases/x");
      expect(repo.delete).toHaveBeenCalledWith("att-1");
    });

    it("throws 404 when the attachment belongs to a different test case", async () => {
      repo.findById.mockResolvedValue({ id: "att-1", testCaseId: "other" });
      await expect(
        service.deleteAttachment(actor, "tc-1", "att-1")
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
