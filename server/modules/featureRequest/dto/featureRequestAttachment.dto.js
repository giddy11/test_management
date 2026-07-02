// modules/featureRequest/dto/featureRequestAttachment.dto.js

function toFeatureRequestAttachmentResponse(att) {
  if (!att) return null;
  return {
    id: att.id,
    featureRequestId: att.featureRequestId,
    fileName: att.fileName,
    fileUrl: att.fileUrl,
    mimeType: att.mimeType,
    fileSizeBytes: att.fileSizeBytes,
    uploadedById: att.uploadedById ?? null,
    createdAt: att.createdAt,
  };
}

module.exports = { toFeatureRequestAttachmentResponse };
