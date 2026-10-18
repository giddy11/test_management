// modules/serviceDesk/controllers/serviceDesk.controller.ts
import { ServiceDeskService } from "../services/serviceDesk.service";
import { ServiceRequestService } from "../services/serviceRequest.service";
import { ApprovalSetupService } from "../services/approvalSetup.service";
import { ServiceDeskReportsService } from "../services/serviceDeskReports.service";
import { ServiceDeskAutomationService } from "../services/serviceDeskAutomation.service";
import { ServiceDeskAiService } from "../services/serviceDeskAi.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

type Handler = (req: any, res: any, next: any) => Promise<void>;

// Every handler is the same shape: call the service with the caller and the
// validated input, wrap the result. `meta` rides along for paginated lists.
function handle(message: string, work: (req: any) => Promise<unknown>, status = 200): Handler {
  return async (req, res, next) => {
    try {
      const result = (await work(req)) as { data?: unknown; meta?: unknown } | unknown;
      const paged = result && typeof result === "object" && "meta" in (result as object) && "data" in (result as object);
      if (paged) {
        const { data, meta } = result as { data: unknown; meta: unknown };
        res.status(status).json(ApiResponse.ok(message, data, meta));
      } else {
        res.status(status).json(status === 201 ? ApiResponse.created(message, result) : ApiResponse.ok(message, result));
      }
    } catch (err) {
      next(err);
    }
  };
}

const desk = () => ServiceDeskService.Instance;
const requests = () => ServiceRequestService.Instance;
const setup = () => ApprovalSetupService.Instance;
const reports = () => ServiceDeskReportsService.Instance;
const automation = () => ServiceDeskAutomationService.Instance;
const ai = () => ServiceDeskAiService.Instance;

export const ServiceDeskController = {
  // Settings
  getSettings: handle("IT requests settings", (req) => desk().getSettings(req.user)),
  updateSettings: handle("IT requests settings updated", (req) => desk().updateSettings(req.user, req.validated.body.enabled)),
  updateApprovalRules: handle("Approval rules updated", (req) =>
    desk().updateApprovalRules(req.user, req.validated.body)
  ),
  updateServiceLevels: handle("Service levels updated", (req) => desk().updateServiceLevels(req.user, req.validated.body)),

  // Approver groups, policies, line managers, delegation
  listGroups: handle("Approver groups", (req) => setup().listGroups(req.user)),
  createGroup: handle("Approver group created", (req) => setup().saveGroup(req.user, null, req.validated.body), 201),
  updateGroup: handle("Approver group updated", (req) => setup().saveGroup(req.user, req.validated.params.id, req.validated.body)),
  deleteGroup: handle("Approver group deleted", (req) => setup().deleteGroup(req.user, req.validated.params.id)),
  listPolicies: handle("Approval policies", (req) => setup().listPolicies(req.user)),
  createPolicy: handle("Approval policy created", (req) => setup().savePolicy(req.user, null, req.validated.body), 201),
  updatePolicy: handle("Approval policy updated", (req) => setup().savePolicy(req.user, req.validated.params.id, req.validated.body)),
  deletePolicy: handle("Approval policy deleted", (req) => setup().deletePolicy(req.user, req.validated.params.id)),
  listManagers: handle("Line managers", (req) => setup().listManagers(req.user)),
  setManager: handle("Line manager updated", (req) =>
    setup().setManager(req.user, req.validated.params.userId, req.validated.body.managerId)
  ),
  delegateCandidates: handle("Possible stand-ins", (req) => setup().delegateCandidates(req.user)),
  myDelegation: handle("Your delegation", (req) => setup().myDelegation(req.user)),
  setDelegation: handle("Delegation saved", (req) => setup().setDelegation(req.user, req.validated.body)),
  clearDelegation: handle("Delegation removed", (req) => setup().clearDelegation(req.user)),

  // Reports
  reports: handle("IT request reports", (req) => reports().overview(req.user, req.validated.query)),

  // Automation: rules, connectors, run log (serviceautomation.manage)
  listRules: handle("Automation rules", (req) => automation().listRules(req.user)),
  createRule: handle("Rule created", (req) => automation().saveRule(req.user, null, req.validated.body), 201),
  updateRule: handle("Rule updated", (req) => automation().saveRule(req.user, req.validated.params.id, req.validated.body)),
  deleteRule: handle("Rule deleted", (req) => automation().deleteRule(req.user, req.validated.params.id)),
  dryRun: handle("Dry run", (req) => automation().dryRun(req.user, req.validated.body.conditions, req.validated.body.actions)),
  listEndpoints: handle("Connectors", (req) => automation().listEndpoints(req.user)),
  createEndpoint: handle("Connector added", (req) => automation().createEndpoint(req.user, req.validated.body), 201),
  updateEndpoint: handle("Connector updated", (req) => automation().updateEndpoint(req.user, req.validated.params.id, req.validated.body)),
  rotateEndpointSecret: handle("Secret replaced", (req) => automation().rotateSecret(req.user, req.validated.params.id)),
  deleteEndpoint: handle("Connector deleted", (req) => automation().deleteEndpoint(req.user, req.validated.params.id)),
  testEndpoint: handle("Connector tested", (req) => automation().testEndpoint(req.user, req.validated.params.id)),
  listRuns: handle("Automation runs", (req) => automation().listRuns(req.user, req.validated.query)),

  // IT interventions on a request (servicedesk.work)
  runAutomation: handle("Automation started", (req) => automation().runNow(req.user, req.validated.params.id)),
  takeOver: handle("Taken over", (req) => automation().takeOver(req.user, req.validated.params.id)),
  clearReview: handle("Review flag cleared", (req) => automation().clearReview(req.user, req.validated.params.id)),
  recordIdentityCheck: handle("Identity check recorded", (req) =>
    automation().recordIdentityCheck(req.user, req.validated.params.id, req.validated.body.method, req.validated.body.note)
  ),

  // Self-service (deflect)
  selfService: handle("Self-service recorded", (req) => automation().deflect(req.user, req.validated.params.id), 201),

  // AI (ai.use at the route; who-may-ask in the service)
  aiIntake: handle("Suggestion ready", (req) => ai().intake(req.user, req.validated.body.description)),
  aiTriage: handle("Triage ready", (req) => ai().triage(req.user, req.validated.params.id)),

  // The connector's callback — public, proven by its one-time token.
  callback: handle("Result recorded", (req) =>
    automation().handleCallback(req.validated.params.runId, req.validated.params.token, req.validated.body)
  ),

  // Catalog
  portalCatalog: handle("IT request catalog", (req) => desk().portalCatalog(req.user)),
  adminCatalog: handle("IT request catalog", (req) => desk().adminCatalog(req.user)),
  createCategory: handle("Category added", (req) => desk().createCategory(req.user, req.validated.body), 201),
  updateCategory: handle("Category updated", (req) => desk().updateCategory(req.user, req.validated.params.id, req.validated.body)),
  createItem: handle("Catalog item added", (req) => desk().createItem(req.user, req.validated.body), 201),
  updateItem: handle("Catalog item updated", (req) => desk().updateItem(req.user, req.validated.params.id, req.validated.body)),
  deleteCategory: handle("Category deleted", (req) => desk().deleteCategory(req.user, req.validated.params.id)),
  deleteItem: handle("Catalog item deleted", (req) => desk().deleteItem(req.user, req.validated.params.id)),

  // People pickers
  approverCandidates: handle("Possible approvers", (req) => desk().approverCandidates(req.user)),
  agents: handle("IT agents", (req) => desk().agents(req.user)),
  colleagues: handle("Colleagues", (req) => desk().colleagues(req.user, req.validated.query.search)),

  // Requests
  counts: handle("IT request counts", (req) => requests().counts(req.user)),
  list: handle("IT requests", (req) => requests().list(req.user, req.validated.query)),
  checkSubmission: handle("Submission check", (req) =>
    requests().checkSubmission(req.user, req.validated.query.itemId, req.validated.query.requestedForId ?? null)
  ),
  approvals: handle("Your approvals", (req) => requests().approvals(req.user, req.validated.query)),
  detail: handle("IT request", (req) => requests().detail(req.user, req.validated.params.id)),
  create: handle("IT request saved", (req) => requests().create(req.user, req.validated.body), 201),
  updateDraft: handle("Draft updated", (req) => requests().updateDraft(req.user, req.validated.params.id, req.validated.body)),
  submit: handle("IT request submitted", (req) => requests().submit(req.user, req.validated.params.id)),
  cancel: handle("IT request cancelled", (req) => requests().cancel(req.user, req.validated.params.id, req.validated.body.reason)),
  approve: handle("IT request approved", (req) => requests().approve(req.user, req.validated.params.id, req.validated.body.comment)),
  reject: handle("IT request rejected", (req) => requests().reject(req.user, req.validated.params.id, req.validated.body.comment)),
  assign: handle("IT request assigned", (req) => requests().assign(req.user, req.validated.params.id, req.validated.body.assigneeId)),
  start: handle("IT request started", (req) => requests().start(req.user, req.validated.params.id)),
  fulfil: handle("IT request fulfilled", (req) => requests().fulfil(req.user, req.validated.params.id, req.validated.body.note)),
  comment: handle(
    "Comment added",
    (req) => requests().comment(req.user, req.validated.params.id, { ...req.validated.body, files: req.files }),
    201
  ),
  editComment: handle("Comment updated", (req) =>
    requests().editComment(req.user, req.validated.params.id, req.validated.params.commentId, req.validated.body)
  ),
  deleteComment: handle("Comment deleted", (req) =>
    requests().deleteComment(req.user, req.validated.params.id, req.validated.params.commentId)
  ),
  askForInfo: handle("Question sent", (req) => requests().askForInfo(req.user, req.validated.params.id, req.validated.body.question)),
  provideInfo: handle("Answer sent", (req) => requests().provideInfo(req.user, req.validated.params.id, req.validated.body.answer)),
  // req.files is guaranteed by uploadCommentAttachments — raw buffers, never disk paths.
  uploadAttachments: handle("Files added", (req) => requests().uploadAttachments(req.user, req.validated.params.id, req.files), 201),
  deleteAttachment: handle("File removed", (req) =>
    requests().deleteAttachment(req.user, req.validated.params.id, req.validated.params.attachmentId)
  ),
};
