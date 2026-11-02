// modules/featureRequest/routes/featureRequest.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const {
  createFeatureRequestSchema,
  updateStatusSchema,
  idParamSchema,
  codeParamSchema,
  fetchFeatureRequestsSchema,
  commentSchema,
  editCommentSchema,
  reactionSchema,
  fetchCommentsSchema,
  commentIdParamSchema,
} = require("../validators/featureRequest.schema");
const { FeatureRequestController } = require("../controllers/featureRequest.controller");

router.get(
  "/",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(fetchFeatureRequestsSchema),
  FeatureRequestController.fetchAll
);
router.get(
  "/by-code/:code",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(codeParamSchema),
  FeatureRequestController.fetchByCode
);
router.get("/:id", authMiddleware, requireProjectAccess("Defects and feature requests — decided by role in the project"), validate(idParamSchema), FeatureRequestController.fetchById);
router.post(
  "/",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(createFeatureRequestSchema),
  FeatureRequestController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(updateStatusSchema),
  FeatureRequestController.updateStatus
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(idParamSchema),
  FeatureRequestController.remove
);
router.get(
  "/:id/history",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(idParamSchema),
  FeatureRequestController.history
);
router.post("/:id/vote", authMiddleware, requireProjectAccess("Defects and feature requests — decided by role in the project"), validate(idParamSchema), FeatureRequestController.vote);

router.get(
  "/:id/comments",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(fetchCommentsSchema),
  FeatureRequestController.fetchComments
);
router.post(
  "/:id/comments",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(commentSchema),
  FeatureRequestController.addComment
);
router.delete(
  "/:id/comments/:commentId",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(commentIdParamSchema),
  FeatureRequestController.removeComment
);
router.patch(
  "/:id/comments/:commentId",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(editCommentSchema),
  FeatureRequestController.editComment
);
router.post(
  "/:id/comments/:commentId/reactions",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(reactionSchema),
  FeatureRequestController.setCommentReaction
);

module.exports = router;
