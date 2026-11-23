// modules/emailLog/routes/emailLog.routes.ts
// The platform owner's read-only view of every email the system sent, tried to
// send or skipped. There is no POST, PATCH or DELETE and there should never be:
// rows are written by the mail sender and removed by the retention job.
import { EmailLogController } from "../controllers/emailLog.controller";
import { listEmailLogSchema, summaryEmailLogSchema } from "../validators/emailLog.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");

const READ = "emaillog.read";

router.get("/", authMiddleware, requirePermission(READ), validate(listEmailLogSchema), EmailLogController.list);
router.get("/summary", authMiddleware, requirePermission(READ), validate(summaryEmailLogSchema), EmailLogController.summary);

module.exports = router;
