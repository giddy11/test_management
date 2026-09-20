// shared/access/routeAudit.js
//
// Deny by default, enforced structurally.
//
// Every route must declare what it needs: requirePermission(...), requireAny(...),
// requireAuthenticatedOnly(...) or publicRoute(...). This walks the mounted
// router tree at boot and, for any route that declares nothing, splices a
// denying handler in front of its stack — so a forgotten declaration fails
// closed at runtime instead of silently being reachable by every authenticated
// principal (audit gap G8).
//
// It also returns the list of offenders, which app.js logs loudly and
// shared/access/tests/routeCoverage.spec.js asserts is empty.
const { GUARD_TAG } = require("./can");
const { ApiResponse } = require("../response/apiResponse");

function denyUndeclared(req, res) {
  console.error(
    `[access] BLOCKED ${req.method} ${req.originalUrl} — route declares no permission`
  );
  return res
    .status(403)
    .json(ApiResponse.error("Forbidden", 403));
}
denyUndeclared[GUARD_TAG] = { kind: "undeclared", codes: [] };

// Express doesn't keep a mounted router's original path, only the regexp it
// compiled. This recovers a readable approximation for logs and reports.
function decodeMountPath(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return "";
  const source = layer.regexp.source;
  const decoded = source
    .replace("^\\/", "/")
    .replace("\\/?(?=\\/|$)", "")
    .replace("(?=\\/|$)", "")
    .replace(/\\\//g, "/")
    .replace(/\$$/, "");
  return decoded === "/" ? "" : decoded;
}

function guardOf(routeLayer) {
  return routeLayer.route.stack.find((s) => s.handle && s.handle[GUARD_TAG]);
}

// Returns [{ method, path, reason }] for every route with no declaration.
function enforceDeclaredPermissions(router, prefix = "") {
  const undeclared = [];

  const walk = (stack, base) => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        const path = `${base}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
        if (!guardOf(layer)) {
          const methods = Object.keys(layer.route.methods)
            .filter((m) => layer.route.methods[m])
            .map((m) => m.toUpperCase());
          for (const method of methods) {
            undeclared.push({ method, path });
          }
          // Fail closed: run before anything else on this route.
          layer.route.stack.unshift({
            handle: denyUndeclared,
            name: "denyUndeclared",
            method: undefined,
            regexp: /^\/?$/,
            keys: [],
            params: undefined,
            path: undefined,
          });
        }
        continue;
      }
      // A mounted sub-router.
      if (layer.handle && typeof layer.handle === "function" && layer.handle.stack) {
        walk(layer.handle.stack, `${base}${decodeMountPath(layer)}`);
      }
    }
  };

  walk(router.stack, prefix);
  return undeclared;
}

// Read-only variant for reporting: every route and what it declares.
function describeRoutes(router, prefix = "") {
  const routes = [];

  const walk = (stack, base) => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        const path = `${base}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
        const guard = guardOf(layer);
        const declaration = guard ? guard.handle[GUARD_TAG] : null;
        for (const method of Object.keys(layer.route.methods)) {
          if (!layer.route.methods[method]) continue;
          routes.push({
            method: method.toUpperCase(),
            path,
            kind: declaration?.kind ?? "undeclared",
            codes: declaration?.codes ?? [],
            reason: declaration?.reason,
          });
        }
        continue;
      }
      if (layer.handle && typeof layer.handle === "function" && layer.handle.stack) {
        walk(layer.handle.stack, `${base}${decodeMountPath(layer)}`);
      }
    }
  };

  walk(router.stack, prefix);
  return routes;
}

module.exports = { enforceDeclaredPermissions, describeRoutes, denyUndeclared };
