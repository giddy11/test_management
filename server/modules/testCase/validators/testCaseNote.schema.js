// modules/testCase/validators/testCaseNote.schema.js
const { z } = require("zod");

const testCaseIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const createNoteSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().trim().min(1, "Note cannot be empty").max(5000),
  }),
});

const noteParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    noteId: z.string().uuid(),
  }),
});

module.exports = { testCaseIdParamSchema, createNoteSchema, noteParamsSchema };
