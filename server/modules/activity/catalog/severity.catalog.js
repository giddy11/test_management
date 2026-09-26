// modules/activity/catalog/severity.catalog.js
//
// How loudly an audit entry reads. Derived from the action code rather than
// passed at every call site: there are ~45 of them across the app, and a
// classification that each one has to remember is a classification that drifts.
// A call site may still pass `severity` explicitly to override.
//
//   info     — routine, expected activity (a record created or updated)
//   warning  — sensitive or hard to reverse (bulk writes, roster changes,
//              amending a recorded result)
//   critical — destructive, or it changes who is allowed to do what
//
// Adding an action: if it is routine, do nothing. Otherwise list it below.
// Anything ending in `.deleted` / `.removed` is a warning by default, so a new
// destructive action is never silently filed as routine.

const Severity = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
});

const SEVERITIES = Object.freeze([Severity.INFO, Severity.WARNING, Severity.CRITICAL]);

// Security-relevant: these change what somebody may do, or destroy a container
// along with everything inside it.
const CRITICAL_ACTIONS = new Set([
  "role.created",
  "role.updated",
  "role.permissions_changed",
  "role.deleted",
  "role.assigned",
  "user.deleted",
  "project.deleted",
  "client_company.deleted",
]);

// Sensitive but not destructive: handing someone a seat, moving work between
// people, rewriting history that was already recorded, or writing many rows at once.
const WARNING_ACTIONS = new Set([
  "user.created",
  "result.amended",
  "result.bulk_recorded",
  "test_case.imported",
  "test_case.assigned",
  "test_case.unassigned",
  "feedback.escalated",
  "sla.settings_updated",
  "client_company.created",
  "client_company.primary_lead_changed",
  "client_company.supporter_added",
  "client_company.supporter_removed",
  "client_company.supporter_lead_changed",
]);

function severityFor(action) {
  if (!action) return Severity.INFO;
  if (CRITICAL_ACTIONS.has(action)) return Severity.CRITICAL;
  if (WARNING_ACTIONS.has(action)) return Severity.WARNING;
  if (action.endsWith(".deleted") || action.endsWith(".removed")) {
    return Severity.WARNING;
  }
  return Severity.INFO;
}

module.exports = { Severity, SEVERITIES, severityFor };
