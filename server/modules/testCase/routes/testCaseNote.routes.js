// modules/testCase/routes/testCaseNote.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  testCaseIdParamSchema,
  createNoteSchema,
  noteParamsSchema,
} = require("../validators/testCaseNote.schema");
const { TestCaseNoteController } = require("../controllers/testCaseNote.controller");

// GET    /test-cases/:id/notes
router.get(
  "/:id/notes",
  authMiddleware,
  requirePermission("note.read"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.list
);

// GET    /test-cases/:id/run-notes  — read-only notes recorded during runs
router.get(
  "/:id/run-notes",
  authMiddleware,
  requirePermission("note.read"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.listRunNotes
);

// POST   /test-cases/:id/notes
router.post(
  "/:id/notes",
  authMiddleware,
  requirePermission("note.manage"),
  validate(createNoteSchema),
  TestCaseNoteController.create
);

// DELETE /test-cases/:id/notes/:noteId
router.delete(
  "/:id/notes/:noteId",
  authMiddleware,
  requirePermission("note.manage"),
  validate(noteParamsSchema),
  TestCaseNoteController.remove
);

module.exports = router;
