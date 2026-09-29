// modules/ticketLink/routes/ticketLink.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const {
  fetchLinksSchema,
  summarySchema,
  similarSchema,
  candidatesSchema,
  createLinkSchema,
  idParamSchema,
} = require("../validators/ticketLink.schema");
const { TicketLinkController } = require("../controllers/ticketLink.controller");

// Links belong to a project, and what a person may do with them is decided by
// their role IN that project (TicketLinkService): read for anyone who can open
// the project, add/remove for anyone who can contribute to it.
const REASON = "Links between tickets — decided by role in the project";

router.get("/", authMiddleware, requireProjectAccess(REASON), validate(fetchLinksSchema), TicketLinkController.fetchLinks);
router.get("/summary", authMiddleware, requireProjectAccess(REASON), validate(summarySchema), TicketLinkController.summary);
router.get("/similar", authMiddleware, requireProjectAccess(REASON), validate(similarSchema), TicketLinkController.similar);
router.get("/candidates", authMiddleware, requireProjectAccess(REASON), validate(candidatesSchema), TicketLinkController.candidates);
router.post("/", authMiddleware, requireProjectAccess(REASON), validate(createLinkSchema), TicketLinkController.create);
router.delete("/:id", authMiddleware, requireProjectAccess(REASON), validate(idParamSchema), TicketLinkController.remove);

module.exports = router;
