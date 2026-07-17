// modules/clientCompany/routes/clientCompany.routes.ts — admin-only management
// of external client companies and their public form links. Supporter-roster
// routes are the one exception: a company's own IT support lead can manage
// their own team too (service-enforced), not just the product team.
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
} from "../validators/clientCompany.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

const adminOnly = [authMiddleware, authorise("superadmin", "admin")];
// Supporter-roster management: the product team, or the company's own IT
// support lead (scoped to their own company — enforced in the service).
const supporterManagers = [authMiddleware, authorise("superadmin", "admin", "it_support")];

// Self-service — an IT supporter's own company. Registered before the
// dynamic "/:id" routes below purely for readability; there's no actual
// collision since none of them are a bare GET "/:id".
router.get("/me", authMiddleware, authorise("it_support"), ClientCompanyController.fetchMine);

router.get("/", ...adminOnly, validate(fetchClientCompaniesSchema), ClientCompanyController.fetchAll);
router.post("/", ...adminOnly, validate(createClientCompanySchema), ClientCompanyController.create);
router.patch("/:id", ...adminOnly, validate(updateClientCompanySchema), ClientCompanyController.update);
router.delete("/:id", ...adminOnly, validate(clientCompanyIdParamSchema), ClientCompanyController.remove);
router.post("/:id/link", ...adminOnly, validate(clientCompanyLinkSchema), ClientCompanyController.setLink);

router.get(
  "/:id/supporters",
  ...supporterManagers,
  validate(clientCompanyIdParamSchema),
  ClientCompanyController.listSupporters
);
router.post(
  "/:id/supporters",
  ...supporterManagers,
  validate(createSupporterSchema),
  ClientCompanyController.createSupporter
);
router.delete(
  "/:id/supporters/:userId",
  ...supporterManagers,
  validate(supporterParamSchema),
  ClientCompanyController.removeSupporter
);
router.patch(
  "/:id/supporters/:userId/lead",
  ...supporterManagers,
  validate(setSupporterLeadSchema),
  ClientCompanyController.setSupporterLead
);

// Designating the primary lead is admin-only, never self-service — peer
// leads can't do this to each other or themselves.
router.patch(
  "/:id/supporters/:userId/primary",
  ...adminOnly,
  validate(setPrimarySupportLeadSchema),
  ClientCompanyController.setPrimarySupportLead
);

module.exports = router;
