// modules/featureRequest/routes/featureRequest.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  createFeatureRequestSchema,
  updateStatusSchema,
  idParamSchema,
  codeParamSchema,
  fetchFeatureRequestsSchema,
  commentSchema,
  fetchCommentsSchema,
  commentIdParamSchema,
} = require("../validators/featureRequest.schema");
const { FeatureRequestController } = require("../controllers/featureRequest.controller");

router.get(
  "/",
  authMiddleware,
  requirePermission("featurerequest.read"),
  validate(fetchFeatureRequestsSchema),
  FeatureRequestController.fetchAll
);
router.get(
  "/by-code/:code",
  authMiddleware,
  requirePermission("featurerequest.read"),
  validate(codeParamSchema),
  FeatureRequestController.fetchByCode
);
router.get("/:id", authMiddleware, requirePermission("featurerequest.read"), validate(idParamSchema), FeatureRequestController.fetchById);
router.post(
  "/",
  authMiddleware,
  requirePermission("featurerequest.create"),
  validate(createFeatureRequestSchema),
  FeatureRequestController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("featurerequest.update"),
  validate(updateStatusSchema),
  FeatureRequestController.updateStatus
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("featurerequest.delete"),
  validate(idParamSchema),
  FeatureRequestController.remove
);
router.post("/:id/vote", authMiddleware, requirePermission("featurerequest.vote"), validate(idParamSchema), FeatureRequestController.vote);

router.get(
  "/:id/comments",
  authMiddleware,
  requirePermission("featurerequest.read"),
  validate(fetchCommentsSchema),
  FeatureRequestController.fetchComments
);
router.post(
  "/:id/comments",
  authMiddleware,
  requirePermission("featurerequest.comment"),
  validate(commentSchema),
  FeatureRequestController.addComment
);
router.delete(
  "/:id/comments/:commentId",
  authMiddleware,
  requirePermission("featurerequest.comment"),
  validate(commentIdParamSchema),
  FeatureRequestController.removeComment
);

module.exports = router;
