// modules/clientCompany/routes/clientCompany.routes.ts — admin-only management
// of external client companies, their public form links, and supporter accounts.
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
} from "../validators/clientCompany.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

const adminOnly = [authMiddleware, authorise("superadmin", "admin")];

router.get("/", ...adminOnly, validate(fetchClientCompaniesSchema), ClientCompanyController.fetchAll);
router.post("/", ...adminOnly, validate(createClientCompanySchema), ClientCompanyController.create);
router.patch("/:id", ...adminOnly, validate(updateClientCompanySchema), ClientCompanyController.update);
router.delete("/:id", ...adminOnly, validate(clientCompanyIdParamSchema), ClientCompanyController.remove);
router.post("/:id/link", ...adminOnly, validate(clientCompanyLinkSchema), ClientCompanyController.setLink);

router.get(
  "/:id/supporters",
  ...adminOnly,
  validate(clientCompanyIdParamSchema),
  ClientCompanyController.listSupporters
);
router.post(
  "/:id/supporters",
  ...adminOnly,
  validate(createSupporterSchema),
  ClientCompanyController.createSupporter
);
router.delete(
  "/:id/supporters/:userId",
  ...adminOnly,
  validate(supporterParamSchema),
  ClientCompanyController.removeSupporter
);
router.patch(
  "/:id/supporters/:userId/lead",
  ...adminOnly,
  validate(setSupporterLeadSchema),
  ClientCompanyController.setSupporterLead
);

module.exports = router;
