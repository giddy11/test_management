// shared/middleware/authorise.middleware.js
//
// REMOVED. Role-name allowlists are no longer how this app authorises.
//
// Every route now declares a permission instead:
//
//   const { requirePermission } = require("../../../shared/access/can");
//   router.patch("/:id", authMiddleware, requirePermission("project.update"), ...)
//
// and services check with can(actor, code) / assertPermission(actor, code).
// See docs/access-model.md and shared/access/can.js.
//
// This shim exists so that a merge or a copied snippet reintroducing
// authorise(...) fails loudly at import time rather than silently installing a
// second, weaker authorisation scheme alongside the real one. It takes no
// arguments and is never valid to call.
function authorise() {
  throw new Error(
    "authorise() has been removed — declare a permission with requirePermission(code) " +
      "from shared/access/can.js instead. See docs/access-model.md."
  );
}

module.exports = { authorise };
