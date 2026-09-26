// modules/testCase/tests/testCaseAttachment.service.spec.js
const {
  TestCaseAttachmentService,
} = require("../services/testCaseAttachment.service");
const { permissionsFor } = require("../../../test/actors");

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
  return {
    getTestCase: jest.fn().mockResolvedValue({ id: "tc-1", suiteId: "s-1" }),
    assertCanContribute: jest.fn().mockResolvedValue({ id: "s-1", projectId: "p-1" }),
  };
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

const actor = { id: "owner-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
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


// Attachments on a test RUN RESULT used to look the row up by id and stop — no
// check that the caller could see the project it belongs to. They now go through
// the result service, which applies the same project access (and, for a tester,
// assigned-cases) check as the result itself.
describe("TestCaseAttachmentService — run result attachments", () => {
  const deny = (message, statusCode = 403) =>
    jest.fn().mockRejectedValue(Object.assign(new Error(message), { statusCode }));

  function build(resultService) {
    const repo = makeAttachmentRepo();
    repo.findByRunResult = jest.fn().mockResolvedValue([{ id: "att-1", runResultId: "res-1" }]);
    repo.countByRunResult = jest.fn().mockResolvedValue(0);
    const storage = makeStorage();
    const service = new TestCaseAttachmentService(
      repo,
      makeTestCaseService(),
      storage,
      {},
      resultService
    );
    return { service, repo, storage };
  }

  const okResult = { id: "res-1", testCaseId: "tc-1", runId: "run-1" };

  it("lists attachments only after the result's project check passes", async () => {
    const resultService = { getResult: jest.fn().mockResolvedValue(okResult) };
    const { service, repo } = build(resultService);
    await expect(service.listRunResultAttachments(actor, "res-1")).resolves.toHaveLength(1);
    expect(resultService.getResult).toHaveBeenCalledWith(actor, "res-1");
    expect(repo.findByRunResult).toHaveBeenCalled();
  });

  it("returns nothing to someone who cannot see the result's project", async () => {
    const resultService = { getResult: deny("You do not have access to this project") };
    const { service, repo } = build(resultService);
    await expect(service.listRunResultAttachments(actor, "res-1")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.findByRunResult).not.toHaveBeenCalled();
  });

  it("uploads nothing for someone who cannot take part in the project", async () => {
    const resultService = {
      getResultForContribution: deny("You have read-only access to this project"),
    };
    const { service, repo, storage } = build(resultService);
    await expect(
      service.uploadRunResultAttachments(actor, "res-1", [file()])
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.uploadImage).not.toHaveBeenCalled();
    expect(repo.createMany).not.toHaveBeenCalled();
  });

  it("uploads for a contributor, stamping the result's case", async () => {
    const resultService = {
      getResultForContribution: jest.fn().mockResolvedValue(okResult),
    };
    const { service, repo } = build(resultService);
    await service.uploadRunResultAttachments(actor, "res-1", [file()]);
    expect(repo.createMany.mock.calls[0][0][0]).toMatchObject({
      testCaseId: "tc-1",
      runResultId: "res-1",
      uploadedById: actor.id,
    });
  });

  it("deletes nothing for someone who cannot take part in the project", async () => {
    const resultService = {
      getResultForContribution: deny("You have read-only access to this project"),
    };
    const { service, repo, storage } = build(resultService);
    await expect(
      service.deleteRunResultAttachment(actor, "res-1", "att-1")
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.deleteImage).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe("TestCaseAttachmentService — a read-only viewer", () => {
  it("cannot attach to or remove from a case they can only read", async () => {
    const repo = makeAttachmentRepo();
    const tcService = makeTestCaseService();
    tcService.assertCanContribute = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("read-only"), { statusCode: 403 }));
    const storage = makeStorage();
    const service = new TestCaseAttachmentService(repo, tcService, storage);

    await expect(service.uploadAttachments(actor, "tc-1", [file()])).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.deleteAttachment(actor, "tc-1", "att-1")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(storage.uploadImage).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
