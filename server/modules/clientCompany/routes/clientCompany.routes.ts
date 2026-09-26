// modules/clientCompany/routes/clientCompany.routes.ts — admin-only management
// of external client companies and their public form links. Supporter-roster
// routes are the one exception: a company's own IT support lead can manage
// their own team too (service-enforced), not just the product team. Adding a
// supporter is narrower still — that's the company's call alone, except to
// bootstrap a company that currently has none (service-enforced).
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
const { requirePermission } = require("../../../shared/access/can");


// Self-service — an IT supporter's own company. Registered before the
// dynamic "/:id" routes below purely for readability; there's no actual
// collision since none of them are a bare GET "/:id".
router.get("/me", authMiddleware, requirePermission("company.read"), ClientCompanyController.fetchMine);

router.get("/", authMiddleware, requirePermission("company.read"), validate(fetchClientCompaniesSchema), ClientCompanyController.fetchAll);
router.post("/", authMiddleware, requirePermission("company.manage"), validate(createClientCompanySchema), ClientCompanyController.create);
router.patch("/:id", authMiddleware, requirePermission("company.manage"), validate(updateClientCompanySchema), ClientCompanyController.update);
router.delete("/:id", authMiddleware, requirePermission("company.manage"), validate(clientCompanyIdParamSchema), ClientCompanyController.remove);
router.post("/:id/link", authMiddleware, requirePermission("company.manage"), validate(clientCompanyLinkSchema), ClientCompanyController.setLink);

router.get(
  "/:id/supporters",
  authMiddleware, requirePermission("company.read"),
  validate(clientCompanyIdParamSchema),
  ClientCompanyController.listSupporters
);
router.post(
  "/:id/supporters",
  authMiddleware, requirePermission("supporter.manage"),
  validate(createSupporterSchema),
  ClientCompanyController.createSupporter
);
router.delete(
  "/:id/supporters/:userId",
  authMiddleware, requirePermission("supporter.manage"),
  validate(supporterParamSchema),
  ClientCompanyController.removeSupporter
);
router.patch(
  "/:id/supporters/:userId/lead",
  authMiddleware, requirePermission("supporter.manage"),
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

// Designating the primary lead is admin-only, never self-service — peer
// leads can't do this to each other or themselves.
router.patch(
  "/:id/supporters/:userId/primary",
  authMiddleware, requirePermission("company.manage"),
  validate(setPrimarySupportLeadSchema),
  ClientCompanyController.setPrimarySupportLead
);

module.exports = router;
