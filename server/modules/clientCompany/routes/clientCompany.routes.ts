// modules/clientCompany/routes/clientCompany.routes.ts — external client
// companies and their public form links. A company belongs to a project, so
// managing one is decided by the caller's role IN that project (its team lead, or
// project.manageall), which ClientCompanyService asserts; the route only checks
// project.read. Supporter-roster routes serve a second audience: a company's own
// IT support lead can manage their own team too (service-enforced), and they hold
// no project.read, so those routes are declared authenticated-only and the
// service decides for both. Adding a supporter is narrower still — that's the
// company's call alone, except to bootstrap a company that currently has none
// (service-enforced).
import { ClientCompanyController } from "../controllers/clientCompany.controller";
import {
  fetchClientCompaniesSchema,
  createClientCompanySchema,
  updateClientCompanySchema,
  clientCompanyIdParamSchema,
  clientCompanyLinkSchema,
  createSupporterSchema,
  supporterParamSchema,
  setSupporterLeadSchema,
  setPrimarySupportLeadSchema,
  setAutoAssignSchema,
} from "../validators/clientCompany.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const {
  requirePermission,
  requireProjectAccess,
  requireAuthenticatedOnly,
} = require("../../../shared/access/can");

const PROJECT_LEVEL = "Client companies — decided by role in the project";
const ROSTER = "Supporter roster — the company's own support lead, or the project's team lead; the service decides";


// Self-service — an IT supporter's own company. Registered before the
// dynamic "/:id" routes below purely for readability; there's no actual
// collision since none of them are a bare GET "/:id".
router.get("/me", authMiddleware, requireAuthenticatedOnly("An IT supporter's own company; the service scopes to the actor's clientCompanyId"), ClientCompanyController.fetchMine);

router.get("/", authMiddleware, requireProjectAccess(PROJECT_LEVEL), validate(fetchClientCompaniesSchema), ClientCompanyController.fetchAll);
router.post("/", authMiddleware, requireProjectAccess(PROJECT_LEVEL), validate(createClientCompanySchema), ClientCompanyController.create);
router.patch("/:id", authMiddleware, requireProjectAccess(PROJECT_LEVEL), validate(updateClientCompanySchema), ClientCompanyController.update);
router.delete("/:id", authMiddleware, requireProjectAccess(PROJECT_LEVEL), validate(clientCompanyIdParamSchema), ClientCompanyController.remove);
router.post("/:id/link", authMiddleware, requireProjectAccess(PROJECT_LEVEL), validate(clientCompanyLinkSchema), ClientCompanyController.setLink);

router.get(
  "/:id/supporters",
  authMiddleware, requireAuthenticatedOnly(ROSTER),
  validate(clientCompanyIdParamSchema),
  ClientCompanyController.listSupporters
);
router.post(
  "/:id/supporters",
  authMiddleware, requireAuthenticatedOnly(ROSTER),
  validate(createSupporterSchema),
  ClientCompanyController.createSupporter
);
router.delete(
  "/:id/supporters/:userId",
  authMiddleware, requireAuthenticatedOnly(ROSTER),
  validate(supporterParamSchema),
  ClientCompanyController.removeSupporter
);
router.patch(
  "/:id/supporters/:userId/lead",
  authMiddleware, requireAuthenticatedOnly(ROSTER),
  validate(setSupporterLeadSchema),
  ClientCompanyController.setSupporterLead
);

// Auto-assign is the flip side of createSupporter's restriction — self-service
// only, no admin fallback at all (see ClientCompanyService.setAutoAssign).
router.patch(
  "/:id/auto-assign",
  authMiddleware,
  requirePermission("company.autoassign"),
  validate(setAutoAssignSchema),
  ClientCompanyController.setAutoAssign
);

// Designating the primary lead is the product team's call (the project's team
// lead), never self-service — peer leads can't do this to each other or
// themselves. The project-level guard keeps supporters out at the route.
router.patch(
  "/:id/supporters/:userId/primary",
  authMiddleware, requireProjectAccess(PROJECT_LEVEL),
  validate(setPrimarySupportLeadSchema),
  ClientCompanyController.setPrimarySupportLead
);

module.exports = router;
