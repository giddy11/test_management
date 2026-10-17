// modules/serviceDesk/controllers/serviceDesk.controller.ts
import { ServiceDeskService } from "../services/serviceDesk.service";
import { ServiceRequestService } from "../services/serviceRequest.service";

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

export const ServiceDeskController = {
  // Settings
  getSettings: handle("IT requests settings", (req) => desk().getSettings(req.user)),
  updateSettings: handle("IT requests settings updated", (req) => desk().updateSettings(req.user, req.validated.body.enabled)),

  // Catalog
  portalCatalog: handle("IT request catalog", (req) => desk().portalCatalog(req.user)),
  adminCatalog: handle("IT request catalog", (req) => desk().adminCatalog(req.user)),
  createCategory: handle("Category added", (req) => desk().createCategory(req.user, req.validated.body), 201),
  updateCategory: handle("Category updated", (req) => desk().updateCategory(req.user, req.validated.params.id, req.validated.body)),
  createItem: handle("Catalog item added", (req) => desk().createItem(req.user, req.validated.body), 201),
  updateItem: handle("Catalog item updated", (req) => desk().updateItem(req.user, req.validated.params.id, req.validated.body)),

  // People pickers
  approverCandidates: handle("Possible approvers", (req) => desk().approverCandidates(req.user)),
  agents: handle("IT agents", (req) => desk().agents(req.user)),
  colleagues: handle("Colleagues", (req) => desk().colleagues(req.user, req.validated.query.search)),

  // Requests
  counts: handle("IT request counts", (req) => requests().counts(req.user)),
  list: handle("IT requests", (req) => requests().list(req.user, req.validated.query)),
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
    (req) => requests().comment(req.user, req.validated.params.id, req.validated.body.body, req.validated.body.internal),
    201
  ),
};
