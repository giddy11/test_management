// modules/testCase/dto/testCaseNote.dto.js

// A display name for a joined user row, falling back to their email.
function personName(user) {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
}

function toNoteResponse(note) {
  if (!note) return null;
  return {
    id: note.id,
    testCaseId: note.testCaseId,
    body: note.body,
    authorId: note.authorId ?? null,
    authorName: personName(note.author),
    createdAt: note.createdAt,
  };
}

// Raw row out of TestCaseNoteRepository.findRunNotes — a note recorded while
// executing a run, flattened with the run it came from.
function toRunNoteResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.runId,
    runName: row.runName,
    status: row.status ?? null,
    notes: row.notes,
    executedById: row.executedById ?? null,
    executedByName: personName(row),
    executedAt: row.executedAt,
  };
}

module.exports = { toNoteResponse, toRunNoteResponse };
