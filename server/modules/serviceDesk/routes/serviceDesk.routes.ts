// modules/serviceDesk/routes/serviceDesk.routes.ts — IT requests.
// Mounted at /api/v1/service-desk. Organisation-level, not project-level:
// these routes are gated on the servicedesk permissions, never project.read.
//
//   servicerequest.create  submit and follow your own requests; approve when an item names you
//   servicedesk.work       the IT queue: assign, start, fulfil, cancel, internal notes
//   servicedesk.manage     turn the module on or off, and the catalog
//
// The routes say what kind of thing you may touch; ServiceRequestService says
// which request (yours, one you approve, or the queue's).
import { ServiceDeskController as C } from "../controllers/serviceDesk.controller";
import {
  intakeSchema,
  createRuleSchema,
  updateRuleSchema,
  dryRunSchema,
  createEndpointSchema,
  updateEndpointSchema,
  runsSchema,
  identityCheckSchema,
  deflectSchema,
  approveSchema,
  askInfoSchema,
  attachmentParamsSchema,
  createGroupSchema,
  createPolicySchema,
  delegationSchema,
  idOnlySchema,
  provideInfoSchema,
  reportSchema,
  serviceLevelsBodySchema,
  setManagerSchema,
  updateGroupSchema,
  updatePolicySchema,
  assignSchema,
  cancelSchema,
  commentSchema,
  checkSubmissionSchema,
  updateApprovalRulesSchema,
  commentIdSchema,
  editCommentSchema,
  createCategorySchema,
  createItemSchema,
  createRequestSchema,
  fulfilSchema,
  listApprovalsSchema,
  listRequestsSchema,
  peopleSchema,
  rejectSchema,
  requestIdSchema,
  updateCategorySchema,
  updateDraftSchema,
  updateItemSchema,
  updateSettingsSchema,
} from "../validators/serviceDesk.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission, requireAny } = require("../../../shared/access/can");
const { uploadCommentAttachments } = require("../../../shared/middleware/upload.middleware");
const { aiRateLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

const CREATE = "servicerequest.create";
const WORK = "servicedesk.work";
const MANAGE = "servicedesk.manage";
const REPORT = "servicedesk.report";
const AUTO = "serviceautomation.manage";

// Settings — everyone in the module reads whether it's on (it decides the sidebar).
router.get("/settings", authMiddleware, requireAny(CREATE, WORK, MANAGE), C.getSettings);
router.put("/settings", authMiddleware, requirePermission(MANAGE), validate(updateSettingsSchema), C.updateSettings);
router.put("/settings/approvals", authMiddleware, requirePermission(MANAGE), validate(updateApprovalRulesSchema), C.updateApprovalRules);

// Catalog
router.get("/catalog", authMiddleware, requirePermission(CREATE), C.portalCatalog);
router.get("/catalog/admin", authMiddleware, requirePermission(MANAGE), C.adminCatalog);
router.post("/catalog/categories", authMiddleware, requirePermission(MANAGE), validate(createCategorySchema), C.createCategory);
router.patch("/catalog/categories/:id", authMiddleware, requirePermission(MANAGE), validate(updateCategorySchema), C.updateCategory);
router.post("/catalog/items", authMiddleware, requirePermission(MANAGE), validate(createItemSchema), C.createItem);
router.patch("/catalog/items/:id", authMiddleware, requirePermission(MANAGE), validate(updateItemSchema), C.updateItem);
// Only for things nobody ever requested — anything used is hidden instead (409).
router.delete("/catalog/categories/:id", authMiddleware, requirePermission(MANAGE), validate(idOnlySchema), C.deleteCategory);
router.delete("/catalog/items/:id", authMiddleware, requirePermission(MANAGE), validate(idOnlySchema), C.deleteItem);

// People pickers
router.get("/people/approvers", authMiddleware, requirePermission(MANAGE), C.approverCandidates);
router.get("/people/agents", authMiddleware, requirePermission(WORK), C.agents);
router.get("/people/colleagues", authMiddleware, requirePermission(CREATE), validate(peopleSchema), C.colleagues);

// Requests. Approvers may hold servicedesk.manage alone: they are the
// fallback when an item names nobody (see resolveApprovers).
router.get("/counts", authMiddleware, requireAny(CREATE, WORK, MANAGE), C.counts);
router.get("/approvals", authMiddleware, requireAny(CREATE, MANAGE), validate(listApprovalsSchema), C.approvals);
router.get("/requests", authMiddleware, requireAny(CREATE, WORK), validate(listRequestsSchema), C.list);
router.post("/requests", authMiddleware, requirePermission(CREATE), validate(createRequestSchema), C.create);
// Declared before /requests/:id so "check" isn't read as an id.
router.get("/requests/check", authMiddleware, requirePermission(CREATE), validate(checkSubmissionSchema), C.checkSubmission);
router.get("/requests/:id", authMiddleware, requireAny(CREATE, WORK, MANAGE), validate(requestIdSchema), C.detail);
router.patch("/requests/:id", authMiddleware, requirePermission(CREATE), validate(updateDraftSchema), C.updateDraft);
router.post("/requests/:id/submit", authMiddleware, requirePermission(CREATE), validate(requestIdSchema), C.submit);
router.post("/requests/:id/cancel", authMiddleware, requireAny(CREATE, WORK), validate(cancelSchema), C.cancel);
router.post("/requests/:id/approve", authMiddleware, requireAny(CREATE, MANAGE), validate(approveSchema), C.approve);
router.post("/requests/:id/reject", authMiddleware, requireAny(CREATE, MANAGE), validate(rejectSchema), C.reject);
router.post("/requests/:id/assign", authMiddleware, requirePermission(WORK), validate(assignSchema), C.assign);
router.post("/requests/:id/start", authMiddleware, requirePermission(WORK), validate(requestIdSchema), C.start);
router.post("/requests/:id/fulfil", authMiddleware, requirePermission(WORK), validate(fulfilSchema), C.fulfil);
// A message may carry files: multipart/form-data, field "files", up to 5 images or PDF/Word/Excel, 10 MB each.
router.post(
  "/requests/:id/comments",
  authMiddleware,
  requireAny(CREATE, WORK, MANAGE),
  uploadCommentAttachments("files", 5, 10),
  validate(commentSchema),
  C.comment
);
// Edit is the author's alone; delete is the author's or an IT-request manager's (checked in the service).
router.patch("/requests/:id/comments/:commentId", authMiddleware, requireAny(CREATE, WORK, MANAGE), validate(editCommentSchema), C.editComment);
router.delete("/requests/:id/comments/:commentId", authMiddleware, requireAny(CREATE, WORK, MANAGE), validate(commentIdSchema), C.deleteComment);
// An approver (on their live step) or IT asks; the requester answers.
router.post("/requests/:id/ask-info", authMiddleware, requireAny(CREATE, WORK, MANAGE), validate(askInfoSchema), C.askForInfo);
router.post("/requests/:id/provide-info", authMiddleware, requirePermission(CREATE), validate(provideInfoSchema), C.provideInfo);
// Files (multipart/form-data, field "files", up to 10 images or PDF/Word/Excel, 10 MB each).
router.post(
  "/requests/:id/attachments",
  authMiddleware,
  requireAny(CREATE, WORK, MANAGE),
  uploadCommentAttachments("files", 10, 10),
  validate(requestIdSchema),
  C.uploadAttachments
);
router.delete(
  "/requests/:id/attachments/:attachmentId",
  authMiddleware,
  requireAny(CREATE, WORK, MANAGE),
  validate(attachmentParamsSchema),
  C.deleteAttachment
);

// Service levels and escalation
router.put("/settings/service-levels", authMiddleware, requirePermission(MANAGE), validate(serviceLevelsBodySchema), C.updateServiceLevels);

// Approver groups and approval policies
router.get("/approver-groups", authMiddleware, requirePermission(MANAGE), C.listGroups);
router.post("/approver-groups", authMiddleware, requirePermission(MANAGE), validate(createGroupSchema), C.createGroup);
router.patch("/approver-groups/:id", authMiddleware, requirePermission(MANAGE), validate(updateGroupSchema), C.updateGroup);
router.delete("/approver-groups/:id", authMiddleware, requirePermission(MANAGE), validate(idOnlySchema), C.deleteGroup);
router.get("/policies", authMiddleware, requirePermission(MANAGE), C.listPolicies);
router.post("/policies", authMiddleware, requirePermission(MANAGE), validate(createPolicySchema), C.createPolicy);
router.patch("/policies/:id", authMiddleware, requirePermission(MANAGE), validate(updatePolicySchema), C.updatePolicy);
router.delete("/policies/:id", authMiddleware, requirePermission(MANAGE), validate(idOnlySchema), C.deletePolicy);

// Line managers (the "line manager" approval rule)
router.get("/people/managers", authMiddleware, requirePermission(MANAGE), C.listManagers);
router.put("/people/:userId/manager", authMiddleware, requirePermission(MANAGE), validate(setManagerSchema), C.setManager);

// Your own out-of-office delegation — anyone who may approve.
router.get("/people/delegates", authMiddleware, requireAny(CREATE, MANAGE), C.delegateCandidates);
router.get("/delegation", authMiddleware, requireAny(CREATE, MANAGE), C.myDelegation);
router.put("/delegation", authMiddleware, requireAny(CREATE, MANAGE), validate(delegationSchema), C.setDelegation);
router.delete("/delegation", authMiddleware, requireAny(CREATE, MANAGE), C.clearDelegation);

// Reports
router.get("/reports", authMiddleware, requirePermission(REPORT), validate(reportSchema), C.reports);

// Automation (Phase 3): rules, connectors and the run log.
router.get("/automation/rules", authMiddleware, requirePermission(AUTO), C.listRules);
router.post("/automation/rules", authMiddleware, requirePermission(AUTO), validate(createRuleSchema), C.createRule);
router.post("/automation/rules/dry-run", authMiddleware, requirePermission(AUTO), validate(dryRunSchema), C.dryRun);
router.patch("/automation/rules/:id", authMiddleware, requirePermission(AUTO), validate(updateRuleSchema), C.updateRule);
router.delete("/automation/rules/:id", authMiddleware, requirePermission(AUTO), validate(idOnlySchema), C.deleteRule);
// Catalog setup also lists connectors (names only) to show which an item uses.
router.get("/automation/endpoints", authMiddleware, requireAny(AUTO, MANAGE), C.listEndpoints);
router.post("/automation/endpoints", authMiddleware, requirePermission(AUTO), validate(createEndpointSchema), C.createEndpoint);
router.patch("/automation/endpoints/:id", authMiddleware, requirePermission(AUTO), validate(updateEndpointSchema), C.updateEndpoint);
router.post("/automation/endpoints/:id/rotate-secret", authMiddleware, requirePermission(AUTO), validate(idOnlySchema), C.rotateEndpointSecret);
router.post("/automation/endpoints/:id/test", authMiddleware, requirePermission(AUTO), validate(idOnlySchema), C.testEndpoint);
router.delete("/automation/endpoints/:id", authMiddleware, requirePermission(AUTO), validate(idOnlySchema), C.deleteEndpoint);
router.get("/automation/runs", authMiddleware, requirePermission(AUTO), validate(runsSchema), C.listRuns);

// IT stepping in where automation can't or shouldn't carry on.
router.post("/requests/:id/run-automation", authMiddleware, requirePermission(WORK), validate(requestIdSchema), C.runAutomation);
router.post("/requests/:id/take-over", authMiddleware, requirePermission(WORK), validate(requestIdSchema), C.takeOver);
router.post("/requests/:id/clear-review", authMiddleware, requirePermission(WORK), validate(requestIdSchema), C.clearReview);
router.post("/requests/:id/identity-check", authMiddleware, requirePermission(WORK), validate(identityCheckSchema), C.recordIdentityCheck);

// AI — advisory only. ai.use at the route (and the AI rate limit, after auth);
// the service checks who may ask: anyone who can request (intake), approvers
// and IT (triage).
router.post("/ai/intake", authMiddleware, requirePermission("ai.use"), aiRateLimiter, validate(intakeSchema), C.aiIntake);
router.post("/requests/:id/ai-triage", authMiddleware, requirePermission("ai.use"), aiRateLimiter, validate(requestIdSchema), C.aiTriage);

// The requester used the item's self-service link instead of asking IT.
router.post("/catalog/items/:id/self-service", authMiddleware, requirePermission(CREATE), validate(deflectSchema), C.selfService);

module.exports = router;
