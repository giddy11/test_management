// modules/featureRequest/routes/featureRequest.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createFeatureRequestSchema,
  updateStatusSchema,
  idParamSchema,
  fetchFeatureRequestsSchema,
  commentSchema,
  fetchCommentsSchema,
  commentIdParamSchema,
} = require("../validators/featureRequest.schema");
const { FeatureRequestController } = require("../controllers/featureRequest.controller");

router.get(
  "/",
  authMiddleware,
  validate(fetchFeatureRequestsSchema),
  FeatureRequestController.fetchAll
);
router.get("/:id", authMiddleware, validate(idParamSchema), FeatureRequestController.fetchById);
router.post(
  "/",
  authMiddleware,
  validate(createFeatureRequestSchema),
  FeatureRequestController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(updateStatusSchema),
  FeatureRequestController.updateStatus
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  FeatureRequestController.remove
);
router.post("/:id/vote", authMiddleware, validate(idParamSchema), FeatureRequestController.vote);

router.get(
  "/:id/comments",
  authMiddleware,
  validate(fetchCommentsSchema),
  FeatureRequestController.fetchComments
);
router.post(
  "/:id/comments",
  authMiddleware,
  validate(commentSchema),
  FeatureRequestController.addComment
);
router.delete(
  "/:id/comments/:commentId",
  authMiddleware,
  validate(commentIdParamSchema),
  FeatureRequestController.removeComment
);

module.exports = router;
