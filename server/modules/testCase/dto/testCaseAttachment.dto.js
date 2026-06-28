// modules/testCase/dto/testCaseAttachment.dto.js

function toAttachmentResponse(att) {
  if (!att) return null;
  return {
    id: att.id,
    testCaseId: att.testCaseId,
    runResultId: att.runResultId ?? null,
    fileName: att.fileName,
    fileUrl: att.fileUrl,
    mimeType: att.mimeType,
    fileSizeBytes: att.fileSizeBytes,
    uploadedById: att.uploadedById ?? null,
    createdAt: att.createdAt,
  };
}

module.exports = { toAttachmentResponse };
