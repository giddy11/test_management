// modules/testCase/routes/testCaseNote.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
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
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.list
);

// GET    /test-cases/:id/run-notes  — read-only notes recorded during runs
router.get(
  "/:id/run-notes",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(testCaseIdParamSchema),
  TestCaseNoteController.listRunNotes
);

// POST   /test-cases/:id/notes
router.post(
  "/:id/notes",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(createNoteSchema),
  TestCaseNoteController.create
);

// DELETE /test-cases/:id/notes/:noteId
router.delete(
  "/:id/notes/:noteId",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(noteParamsSchema),
  TestCaseNoteController.remove
);

module.exports = router;
