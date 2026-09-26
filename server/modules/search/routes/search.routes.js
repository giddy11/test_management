// modules/search/routes/search.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const { searchSchema } = require("../validators/search.schema");
const { SearchController } = require("../controllers/search.controller");

// project.read is the right gate even though the results span suites, cases,
// runs, bugs and tickets: all of those are reached THROUGH a project, and what
// may be seen inside one is decided per project by the query's own scoping.
router.get(
  "/",
  authMiddleware,
  requirePermission("project.read"),
  validate(searchSchema),
  SearchController.search
);

module.exports = router;
