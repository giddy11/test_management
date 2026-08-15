// modules/testCase/routes/testCaseNote.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
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
  authorise("superadmin", "admin", "user"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.list
);

// GET    /test-cases/:id/run-notes  — read-only notes recorded during runs
router.get(
  "/:id/run-notes",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.listRunNotes
);

// POST   /test-cases/:id/notes
router.post(
  "/:id/notes",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(createNoteSchema),
  TestCaseNoteController.create
);

// DELETE /test-cases/:id/notes/:noteId
router.delete(
  "/:id/notes/:noteId",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(noteParamsSchema),
  TestCaseNoteController.remove
);

module.exports = router;
