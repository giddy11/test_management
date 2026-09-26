// modules/testCase/tests/testCaseNote.service.spec.js
const { TestCaseNoteService } = require("../services/testCaseNote.service");
const { permissionsFor } = require("../../../test/actors");

function makeNoteRepo() {
  return {
    findByTestCase: jest.fn().mockResolvedValue([]),
    findRunNotes: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    countByTestCase: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation(async (row) => ({ id: "note-1", ...row })),
    delete: jest.fn(),
  };
}

function makeTestCaseService(assertCanManageProject = jest.fn().mockResolvedValue(undefined)) {
  return {
    getTestCase: jest.fn().mockResolvedValue({ id: "tc-1", suiteId: "s-1", title: "Valid login" }),
    assertCanContribute: jest
      .fn()
      .mockResolvedValue({ id: "s-1", name: "Auth", projectId: "p-1" }),
    suiteService: {
      getTestSuite: jest.fn().mockResolvedValue({ id: "s-1", name: "Auth", projectId: "p-1" }),
      projectService: { assertCanManageProject },
    },
  };
}

const actor = { id: "user-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };

describe("TestCaseNoteService", () => {
  let repo;
  let tcService;
  let service;

  beforeEach(() => {
    repo = makeNoteRepo();
    tcService = makeTestCaseService();
    service = new TestCaseNoteService(repo, tcService);
  });

  describe("listNotes", () => {
    it("checks case access before returning the thread", async () => {
      repo.findByTestCase.mockResolvedValue([{ id: "note-1" }]);
      const notes = await service.listNotes(actor, "tc-1");
      expect(tcService.getTestCase).toHaveBeenCalledWith(actor, "tc-1");
      expect(notes).toHaveLength(1);
    });
  });

  describe("listRunNotes", () => {
    it("checks case access before returning run notes", async () => {
      repo.findRunNotes.mockResolvedValue([{ id: "res-1", notes: "flaky" }]);
      const notes = await service.listRunNotes(actor, "tc-1");
      expect(tcService.getTestCase).toHaveBeenCalledWith(actor, "tc-1");
      expect(notes).toHaveLength(1);
    });
  });

  describe("addNote", () => {
    it("stamps the actor as author", async () => {
      const note = await service.addNote(actor, "tc-1", "Flaky on Safari");
      expect(repo.create).toHaveBeenCalledWith({
        testCaseId: "tc-1",
        body: "Flaky on Safari",
        authorId: "user-1",
      });
      expect(note).toMatchObject({ id: "note-1", body: "Flaky on Safari" });
    });

    it("throws 422 once the per-case cap is reached", async () => {
      repo.countByTestCase.mockResolvedValue(200);
      await expect(service.addNote(actor, "tc-1", "one more")).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteNote", () => {
    it("lets the author delete their own note without a manage check", async () => {
      repo.findById.mockResolvedValue({ id: "note-1", testCaseId: "tc-1", authorId: "user-1" });
      await service.deleteNote(actor, "tc-1", "note-1");
      expect(tcService.suiteService.projectService.assertCanManageProject).not.toHaveBeenCalled();
      expect(repo.delete).toHaveBeenCalledWith("note-1");
    });

    it("requires manage rights to delete someone else's note", async () => {
      const assertCanManageProject = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error("Forbidden"), { statusCode: 403 }));
      service = new TestCaseNoteService(repo, makeTestCaseService(assertCanManageProject));
      repo.findById.mockResolvedValue({ id: "note-1", testCaseId: "tc-1", authorId: "someone-else" });

      await expect(service.deleteNote(actor, "tc-1", "note-1")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("throws 404 when the note belongs to a different test case", async () => {
      repo.findById.mockResolvedValue({ id: "note-1", testCaseId: "other", authorId: "user-1" });
      await expect(service.deleteNote(actor, "tc-1", "note-1")).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});


describe("TestCaseNoteService — a read-only viewer", () => {
  it("can read notes but not add one", async () => {
    const repo = makeNoteRepo();
    const tcService = makeTestCaseService();
    tcService.assertCanContribute.mockRejectedValue(
      Object.assign(new Error("You have read-only access to this project"), { statusCode: 403 })
    );
    const service = new TestCaseNoteService(repo, tcService);

    await expect(service.listNotes(actor, "tc-1")).resolves.toEqual([]);
    await expect(service.addNote(actor, "tc-1", "hello")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});
