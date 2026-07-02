// modules/bug/dto/bugAttachment.dto.js

function toBugAttachmentResponse(att) {
  if (!att) return null;
  return {
    id: att.id,
    bugId: att.bugId,
    fileName: att.fileName,
    fileUrl: att.fileUrl,
    mimeType: att.mimeType,
    fileSizeBytes: att.fileSizeBytes,
    uploadedById: att.uploadedById ?? null,
    createdAt: att.createdAt,
  };
}

module.exports = { toBugAttachmentResponse };
