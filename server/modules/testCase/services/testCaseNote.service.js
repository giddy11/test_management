// modules/testCase/services/testCaseNote.service.js
const { TestCaseNoteRepository } = require("../repositories/testCaseNote.repository");
const { TestCaseService } = require("./testCase.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");

const MAX_NOTES_PER_CASE = 200;

class TestCaseNoteService {
  static Instance = new TestCaseNoteService();

  constructor(
    noteRepo = TestCaseNoteRepository.Instance,
    testCaseService = TestCaseService.Instance
  ) {
    this.noteRepo = noteRepo;
    this.testCaseService = testCaseService;
  }

  async listNotes(actor, testCaseId) {
    await this.testCaseService.getTestCase(actor, testCaseId); // access check
    return this.noteRepo.findByTestCase(testCaseId);
  }

  async listRunNotes(actor, testCaseId) {
    await this.testCaseService.getTestCase(actor, testCaseId); // access check
    return this.noteRepo.findRunNotes(testCaseId);
  }

  // Any project member can add a note — assignees included, same bar as
  // attaching a screenshot. Notes are commentary, not case definition. A
  // read-only viewer can read them but not add to them.
  async addNote(actor, testCaseId, body) {
    const tc = await this.testCaseService.getTestCase(actor, testCaseId);
    const suite = await this.testCaseService.assertCanContribute(actor, tc);

    const existing = await this.noteRepo.countByTestCase(testCaseId);
    if (existing >= MAX_NOTES_PER_CASE) {
      throw new AppError(`A test case can have at most ${MAX_NOTES_PER_CASE} notes`, 422);
    }

    const note = await this.noteRepo.create({ testCaseId, body, authorId: actor.id });

    ActivityService.Instance.log(actor, {
      action: "test_case.note_added",
      summary: `Added a note on test case "${tc.title}"${suite ? ` in suite "${suite.name}"` : ""}`,
      entityType: "test_case",
      entityId: tc.id,
      metadata: { suiteId: tc.suiteId, projectId: suite?.projectId ?? null, noteId: note.id },
    });

    return note;
  }

  // Authors clean up after themselves; anyone who can manage the project can
  // remove any note.
  async deleteNote(actor, testCaseId, noteId) {
    const tc = await this.testCaseService.getTestCase(actor, testCaseId);

    const note = await this.noteRepo.findById(noteId);
    if (!note || note.testCaseId !== testCaseId) {
      throw new AppError("Note not found", 404);
    }

    if (note.authorId !== actor.id) {
      const suite = await this.testCaseService.suiteService.getTestSuite(actor, tc.suiteId);
      await this.testCaseService.suiteService.projectService.assertCanManageProject(
        actor,
        suite.projectId
      );
    }

    await this.noteRepo.delete(note.id);
  }
}

module.exports = { TestCaseNoteService, MAX_NOTES_PER_CASE };
