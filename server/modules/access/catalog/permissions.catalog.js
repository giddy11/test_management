// modules/access/catalog/permissions.catalog.js
//
// THE catalog. Permissions, their categories, and the built-in role definitions.
// Pure data with no DB or framework dependency, so the seed script, the migration,
// the resolver tests and the matrix test all read the same source.
//
// See docs/access-model.md for the design rationale behind every entry here.
//
// Adding a permission: add it to PERMISSIONS, then add it to whichever BUILTIN_ROLES
// should hold it. A new permission is NOT silently granted to existing roles — it
// appears unchecked in the role editor, which is the deny-by-default behaviour.

// The permission that implies every other one. Held only by the locked super role.
const WILDCARD = "*";

const CATEGORIES = [
  {
    key: "organisation",
    label: "Organisation & platform",
    description: "Workspace-wide configuration and the platform controls behind it.",
  },
  {
    key: "access",
    label: "Roles & people",
    description: "Who is on the team, and what they are allowed to do.",
  },
  {
    key: "projects",
    label: "Projects",
    description: "The containers everything else hangs off.",
  },
  {
    key: "authoring",
    label: "Test authoring",
    description: "Suites, test cases, their notes, and bulk import.",
  },
  {
    key: "execution",
    label: "Test execution",
    description: "Runs, and the results recorded against them.",
  },
  {
    key: "workitems",
    label: "Defects & feature requests",
    description: "Work raised against a project, from report through to closure.",
  },
  {
    key: "tickets",
    label: "Customer tickets",
    description: "Feedback submitted through a project's public form, and its triage.",
  },
  {
    key: "support",
    label: "Support desk",
    description: "External client companies and the queue their IT supporters work.",
  },
  {
    key: "conversations",
    label: "Conversations & broadcasts",
    description: "Live chat, in-app support chat, and messages sent to everyone.",
  },
  {
    key: "analytics",
    label: "Reporting & analytics",
    description: "Management reporting.",
  },
];

// `warning` renders as the amber note under the checkbox in the role editor.
// Reserve it for permissions whose blast radius isn't obvious from the label.
const PERMISSIONS = [
  // ── Organisation & platform ────────────────────────────────────────────────
  { code: "audit.read", category: "organisation", label: "View activity log", description: "Read the organisation's activity log." },
  { code: "platform.read", category: "organisation", label: "View all organisations", description: "Cross-organisation overview.", warning: "Reads data across every organisation" },

  // ── Roles & people ─────────────────────────────────────────────────────────
  { code: "role.read", category: "access", label: "View roles", description: "See roles and their permission sets." },
  { code: "role.manage", category: "access", label: "Manage roles", description: "Create, edit and delete roles.", warning: "Can grant any permission" },
  { code: "role.assign", category: "access", label: "Assign roles", description: "Give a user a role.", warning: "Can give any user any role" },
  { code: "user.read", category: "access", label: "View team members", description: "List and view team members." },
  { code: "user.create", category: "access", label: "Add team members", description: "Create a team member account." },
  { code: "user.update", category: "access", label: "Edit team members", description: "Edit a team member's details." },
  { code: "user.delete", category: "access", label: "Remove team members", description: "Remove a team member from the organisation.", warning: "Removes the person's access immediately" },

  // ── Projects ───────────────────────────────────────────────────────────────
  { code: "project.read", category: "projects", label: "View projects", description: "See projects and their details." },
  // The scoping switch. project.read says you may look at projects at all;
  // this says you see every project in the organisation rather than only the
  // ones you belong to or have a test case assigned in. It is what the
  // services' old `actor.role === UserRole.USER` checks became.
  { code: "project.readall", category: "projects", label: "View all projects", description: "See every project in the organisation, not only your own." },
  { code: "project.create", category: "projects", label: "Create projects", description: "Start a new project." },
  { code: "project.update", category: "projects", label: "Edit projects", description: "Change a project's name, description and metadata." },
  { code: "project.delete", category: "projects", label: "Delete projects", description: "Remove a project and everything in it." },
  { code: "project.configure", category: "projects", label: "Manage project membership", description: "Add and remove members, and set team leads." },
  { code: "project.export", category: "projects", label: "Export projects", description: "Download a project or suite as a spreadsheet." },

  // ── Test authoring ─────────────────────────────────────────────────────────
  { code: "suite.read", category: "authoring", label: "View test suites", description: "See suites and their contents." },
  { code: "suite.manage", category: "authoring", label: "Manage test suites", description: "Create, edit and delete suites." },
  { code: "testcase.read", category: "authoring", label: "View test cases", description: "See test cases and their steps." },
  { code: "testcase.create", category: "authoring", label: "Write test cases", description: "Draft a new test case." },
  { code: "testcase.update", category: "authoring", label: "Edit test cases", description: "Change an existing test case." },
  { code: "testcase.delete", category: "authoring", label: "Delete test cases", description: "Remove a test case." },
  { code: "testcase.approve", category: "authoring", label: "Activate test cases", description: "Move a case from Draft to Active." },
  { code: "testcase.deprecate", category: "authoring", label: "Retire test cases", description: "Move an Active case to Deprecated." },
  { code: "testcase.assign", category: "authoring", label: "Assign testers", description: "Choose who runs a test case." },
  { code: "import.run", category: "authoring", label: "Run bulk import", description: "Import test cases from a spreadsheet." },
  { code: "note.read", category: "authoring", label: "View case notes", description: "Read notes on a test case and notes recorded during runs." },
  { code: "note.manage", category: "authoring", label: "Write case notes", description: "Add and delete notes." },

  // ── Test execution ─────────────────────────────────────────────────────────
  { code: "run.read", category: "execution", label: "View test runs", description: "See runs and their progress." },
  { code: "run.create", category: "execution", label: "Start test runs", description: "Open a new run." },
  { code: "run.update", category: "execution", label: "Edit test runs", description: "Change a run's details while it is in progress." },
  { code: "run.delete", category: "execution", label: "Delete test runs", description: "Remove a run and its results." },
  { code: "run.close", category: "execution", label: "Close test runs", description: "Mark a run complete, freezing its results." },
  { code: "result.read", category: "execution", label: "View results", description: "See recorded pass, fail, blocked and skipped outcomes." },
  { code: "result.enter", category: "execution", label: "Record results", description: "Record the outcome of executing a test case." },
  { code: "result.amend", category: "execution", label: "Amend closed results", description: "Change a result after its run has been closed.", warning: "Every change is audited" },
  { code: "result.delete", category: "execution", label: "Delete results", description: "Remove a recorded result." },

  // ── Defects & feature requests ─────────────────────────────────────────────
  { code: "bug.read", category: "workitems", label: "View bugs", description: "See reported bugs." },
  { code: "bug.create", category: "workitems", label: "Report bugs", description: "Raise a new bug." },
  { code: "bug.update", category: "workitems", label: "Edit bugs", description: "Change a bug's description and details." },
  { code: "bug.delete", category: "workitems", label: "Delete bugs", description: "Remove a bug report." },
  { code: "bug.triage", category: "workitems", label: "Triage bugs", description: "Set severity, priority and assignee." },
  { code: "bug.verify", category: "workitems", label: "Verify fixes", description: "Move a Fixed bug to Verified." },
  { code: "bug.close", category: "workitems", label: "Close bugs", description: "Close a bug, or reopen a closed one." },
  { code: "featurerequest.read", category: "workitems", label: "View feature requests", description: "See feature requests." },
  { code: "featurerequest.create", category: "workitems", label: "Raise feature requests", description: "Submit a new feature request." },
  { code: "featurerequest.update", category: "workitems", label: "Edit feature requests", description: "Change a request's details." },
  { code: "featurerequest.delete", category: "workitems", label: "Delete feature requests", description: "Remove a feature request." },
  { code: "featurerequest.decide", category: "workitems", label: "Decide feature requests", description: "Move a request through review to Planned, Done or Rejected." },
  { code: "featurerequest.vote", category: "workitems", label: "Vote on feature requests", description: "Add or remove a vote." },
  { code: "featurerequest.comment", category: "workitems", label: "Comment on feature requests", description: "Post and delete thread comments." },

  // ── Customer tickets ───────────────────────────────────────────────────────
  { code: "ticket.read", category: "tickets", label: "View tickets", description: "See submitted tickets and their history." },
  { code: "ticket.assign", category: "tickets", label: "Assign tickets", description: "Route a ticket to a team member." },
  { code: "ticket.update", category: "tickets", label: "Update ticket status", description: "Advance a ticket through its working stages." },
  { code: "ticket.resolve", category: "tickets", label: "Resolve tickets", description: "Mark a ticket resolved." },
  { code: "ticket.close", category: "tickets", label: "Close tickets", description: "Close a resolved ticket." },
  { code: "ticket.delete", category: "tickets", label: "Delete tickets", description: "Remove a ticket." },
  { code: "ticket.comment", category: "tickets", label: "Reply to tickets", description: "Post in a ticket's conversation thread." },
  { code: "form.configure", category: "tickets", label: "Configure the public form", description: "Enable, rotate or disable a project's public form link.", warning: "Rotating a link breaks every form already shared" },

  // ── Support desk ───────────────────────────────────────────────────────────
  { code: "supportqueue.read", category: "support", label: "View support queue", description: "See the client company's ticket queue." },
  { code: "supportqueue.update", category: "support", label: "Advance queue items", description: "Move an item through logged, acknowledged and investigating." },
  { code: "supportqueue.assign", category: "support", label: "Route queue items", description: "Assign an item to a teammate." },
  { code: "supportqueue.resolve", category: "support", label: "Resolve queue items", description: "Close an item fixed locally." },
  { code: "supportqueue.escalate", category: "support", label: "Escalate to the product team", description: "Hand an item over with a severity." },
  { code: "supportqueue.send", category: "support", label: "Notify submitters", description: "Email the end user about their item." },
  { code: "company.read", category: "support", label: "View client companies", description: "See client company records." },
  { code: "company.manage", category: "support", label: "Manage client companies", description: "Create, edit and delete client companies." },
  // Deliberately NOT bundled with designating the primary lead, which is the
  // product team's call and never self-service. Auto-assign is the opposite:
  // the company's own routing rule. Both were one "configure" permission at
  // first, which quietly handed each audience the other's power.
  { code: "company.autoassign", category: "support", label: "Configure auto-assign", description: "Set how incoming queue items are routed within a client company." },
  { code: "supporter.manage", category: "support", label: "Manage supporters", description: "Add, remove and promote a company's IT supporters." },

  // ── Conversations & broadcasts ─────────────────────────────────────────────
  { code: "livechat.read", category: "conversations", label: "View live chat", description: "Read the operator inbox and visitor list." },
  { code: "livechat.send", category: "conversations", label: "Reply in live chat", description: "Send a message to a visitor." },
  { code: "livechat.assign", category: "conversations", label: "Assign conversations", description: "Route a conversation to an operator." },
  { code: "livechat.manage", category: "conversations", label: "Manage conversations", description: "Change a conversation's status." },
  { code: "livechat.configure", category: "conversations", label: "Configure the widget", description: "Change a project's widget presentation settings." },
  { code: "widget.configure", category: "conversations", label: "Configure the widget link", description: "Enable, rotate or disable a project's widget link.", warning: "Rotating a link breaks every embedded widget" },
  { code: "supportchat.read", category: "conversations", label: "View support chat inbox", description: "Read in-app conversations with the platform team." },
  { code: "supportchat.send", category: "conversations", label: "Reply in support chat", description: "Respond in an in-app support conversation." },
  { code: "supportchat.manage", category: "conversations", label: "Manage support chat", description: "Close conversations, and turn the platform-wide support chat on or off." },
  { code: "announcement.manage", category: "conversations", label: "Manage announcements", description: "Write, publish and delete product announcements." },
  { code: "banner.publish", category: "conversations", label: "Broadcast site banner", description: "Show a banner to everyone on the platform.", warning: "Shown to every user on the platform" },

  // ── Reporting & analytics ──────────────────────────────────────────────────
  { code: "dashboard.read", category: "analytics", label: "View dashboard", description: "See the dashboard overview and recent runs." },
  { code: "analytics.read", category: "analytics", label: "View analytics", description: "Organisation-wide breakdowns of bugs, requests and throughput." },
  { code: "analytics.team", category: "analytics", label: "View team performance", description: "Per-person performance reporting." },
  { code: "sla.read", category: "analytics", label: "View SLA reports", description: "See SLA attainment and ticket timings." },
  { code: "sla.configure", category: "analytics", label: "Configure SLA targets", description: "Change the SLA rules the whole organisation is measured against." },
];

const ALL_CODES = PERMISSIONS.map((p) => p.code);

// ── The two boundaries the catalog has to respect ────────────────────────────
//
// TestMate is multi-tenant, so "administrator" means two different principals
// and they must not be conflated:
//
//   - the PLATFORM OWNER (the vendor) runs the platform: cross-organisation
//     reporting, product announcements, the site banner, and the in-app support
//     inbox customers write to. That inbox and those broadcasts are the
//     vendor's, not any customer's.
//   - an ORGANISATION ADMINISTRATOR owns one customer's workspace and
//     everything in it, and nothing outside it.
//
// Giving the organisation administrator "every permission" would hand every
// customer admin the vendor's controls, which is how the platform-only items
// ended up in their sidebar. They are reachable only through the locked super
// administrator's wildcard.
const PLATFORM_ONLY = [
  "platform.read",
  "announcement.manage",
  "banner.publish",
  "supportchat.read",
  "supportchat.send",
  "supportchat.manage",
];

// The support queue belongs to an external client company's own IT supporters.
// The product team sees one of their tickets only once it is escalated, and
// then through ticket.read like any other ticket.
const SUPPORT_DESK_ONLY = [
  "supportqueue.read",
  "supportqueue.update",
  "supportqueue.assign",
  "supportqueue.resolve",
  "supportqueue.escalate",
  "supportqueue.send",
  "company.autoassign",
];

const ORG_ADMIN_PERMISSIONS = ALL_CODES.filter(
  (code) => !PLATFORM_ONLY.includes(code) && !SUPPORT_DESK_ONLY.includes(code)
);

// ── Built-in roles ───────────────────────────────────────────────────────────
// `key` is the stable seed identity — never rename it. `name` is what an admin
// sees and is fixed for built-in roles; the permission set is not.

const ROLE_KEYS = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ORG_ADMIN: "org_admin",
  QA_MANAGER: "qa_manager",
  TEST_LEAD: "test_lead",
  QA_ENGINEER: "qa_engineer",
  TESTER: "tester",
  SUPPORT_MANAGER: "support_manager",
  SUPPORT_LEAD: "support_lead",
  SUPPORT_AGENT: "support_agent",
  VIEWER: "viewer",
});

const QA_ENGINEER_PERMISSIONS = [
  "user.read",
  "project.read", "project.export",
  "suite.read", "suite.manage",
  "testcase.read", "testcase.create", "testcase.update", "testcase.assign",
  "import.run", "note.read", "note.manage",
  "run.read", "run.create", "run.update",
  "result.read", "result.enter",
  "bug.read", "bug.create", "bug.update",
  "featurerequest.read", "featurerequest.create", "featurerequest.update",
  "featurerequest.vote", "featurerequest.comment",
  "ticket.read", "ticket.comment",
  "livechat.read", "livechat.send",
  "dashboard.read",
];

// A Tester is a QA engineer who executes rather than authors: no suite or case
// authoring, no assignment, no bulk import.
const TESTER_REMOVES = [
  "suite.manage",
  "testcase.create",
  "testcase.update",
  "testcase.assign",
  "import.run",
  "project.export",
  "featurerequest.update",
  "run.update",
  "livechat.send",
];

const SUPPORT_LEAD_PERMISSIONS = [
  "supportqueue.read", "supportqueue.update", "supportqueue.assign",
  "supportqueue.resolve", "supportqueue.escalate", "supportqueue.send",
  "company.read", "company.autoassign", "supporter.manage",
  "audit.read", "sla.read",
];

// An agent works their own items; routing work and changing the roster are the
// lead's job.
const SUPPORT_AGENT_REMOVES = ["supportqueue.assign", "company.autoassign", "supporter.manage"];

const without = (list, removed) => list.filter((code) => !removed.includes(code));

const BUILTIN_ROLES = [
  {
    key: ROLE_KEYS.SUPER_ADMIN,
    name: "Super administrator",
    description: "The platform owner. Holds every permission, including ones added later.",
    isLocked: true,
    platformWide: true, // organization_id IS NULL — one row for the whole platform
    permissions: [WILDCARD],
  },
  {
    key: ROLE_KEYS.ORG_ADMIN,
    name: "Organisation administrator",
    description:
      "The everyday owner of this organisation — everything inside it, and nothing outside it.",
    permissions: ORG_ADMIN_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.QA_MANAGER,
    name: "QA manager",
    description: "Approval and closure authority with full visibility, and no operational data entry.",
    permissions: [
      "audit.read",
      "role.read", "user.read",
      "project.read", "project.readall", "project.create", "project.update", "project.configure", "project.export",
      "suite.read", "suite.manage",
      "testcase.read", "testcase.approve", "testcase.deprecate", "testcase.assign",
      "note.read",
      "run.read", "run.create", "run.update", "run.close",
      "result.read", "result.amend",
      "bug.read", "bug.triage", "bug.verify", "bug.close",
      "featurerequest.read", "featurerequest.decide", "featurerequest.vote", "featurerequest.comment",
      "ticket.read", "ticket.assign", "ticket.update", "ticket.resolve", "ticket.close", "ticket.comment",
      // No supportqueue.* — the support portal is the client company's own
      // queue. The product team sees a company ticket only once it is
      // escalated, and then through ticket.read like any other ticket.
      "company.read",
      "livechat.read", "livechat.assign", "livechat.manage",
      "dashboard.read", "analytics.read", "analytics.team", "sla.read",
    ],
  },
  {
    key: ROLE_KEYS.TEST_LEAD,
    name: "Test lead",
    description: "Supervisor and approver inside their own projects. Enters data and approves it.",
    permissions: [
      "user.read",
      "project.read", "project.export",
      "suite.read", "suite.manage",
      "testcase.read", "testcase.create", "testcase.update", "testcase.approve", "testcase.assign",
      "import.run", "note.read", "note.manage",
      "run.read", "run.create", "run.update", "run.close",
      "result.read", "result.enter",
      "bug.read", "bug.create", "bug.update", "bug.triage", "bug.verify",
      "featurerequest.read", "featurerequest.create", "featurerequest.update",
      "featurerequest.vote", "featurerequest.comment",
      "ticket.read", "ticket.assign", "ticket.update", "ticket.resolve", "ticket.comment",
      "livechat.read", "livechat.send", "livechat.assign", "livechat.manage",
      "dashboard.read", "analytics.read", "sla.read",
    ],
  },
  {
    key: ROLE_KEYS.QA_ENGINEER,
    name: "QA engineer",
    description: "Authors test cases and executes them. Cannot approve anything.",
    permissions: QA_ENGINEER_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.TESTER,
    name: "Tester",
    description: "Executes the cases assigned to them and reports what they find.",
    permissions: without(QA_ENGINEER_PERMISSIONS, TESTER_REMOVES),
  },
  {
    key: ROLE_KEYS.SUPPORT_MANAGER,
    name: "Support manager",
    description: "Product-side owner of customer tickets and client company relationships.",
    permissions: [
      "audit.read",
      "user.read", "project.read", "project.readall",
      "bug.read", "bug.create", "featurerequest.read", "featurerequest.create",
      "ticket.read", "ticket.assign", "ticket.update", "ticket.resolve", "ticket.close",
      "ticket.delete", "ticket.comment", "form.configure",
      // No supportqueue.* here either — managing the companies is the product
      // team's job; working their queue is not.
      // No company.autoassign: routing inside a client company is that
      // company's own lead's call, with no product-team fallback.
      "company.read", "company.manage", "supporter.manage",
      "livechat.read", "livechat.send", "livechat.assign", "livechat.manage",
      "livechat.configure", "widget.configure",
      "dashboard.read", "analytics.read", "sla.read", "sla.configure",
    ],
  },
  {
    key: ROLE_KEYS.SUPPORT_LEAD,
    name: "Support lead",
    description: "The IT support lead at a client company. Sees only their own company's queue.",
    permissions: SUPPORT_LEAD_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.SUPPORT_AGENT,
    name: "Support agent",
    description: "An IT supporter at a client company. Works their own assigned items.",
    permissions: without(SUPPORT_LEAD_PERMISSIONS, SUPPORT_AGENT_REMOVES),
  },
  {
    key: ROLE_KEYS.VIEWER,
    name: "Viewer",
    description: "A stakeholder who needs to see quality status across the organisation without touching anything.",
    permissions: [
      "project.read", "project.readall", "suite.read", "testcase.read", "note.read",
      "run.read", "result.read",
      "bug.read", "featurerequest.read", "ticket.read",
      "dashboard.read", "analytics.read", "sla.read",
    ],
  },
];

// Which built-in role each legacy UserRole maps to. Used by the backfill
// migration and by user creation while `users.role` still exists.
const LEGACY_ROLE_MAP = Object.freeze({
  superadmin: ROLE_KEYS.SUPER_ADMIN,
  admin: ROLE_KEYS.ORG_ADMIN,
  user: ROLE_KEYS.QA_ENGINEER,
  // it_support splits on users.is_support_lead — see roleForLegacyUser.
  it_support: ROLE_KEYS.SUPPORT_AGENT,
});

// `isTeamLead` is true when the user leads at least one project
// (project_members.role = 'team_lead'). Under the old model that gave them
// management of those projects — approving work, triaging their bugs — which
// is the Test lead role, not QA engineer. Mapping them to QA engineer would
// quietly take away capabilities they have today.
function roleKeyForLegacyUser(role, isSupportLead, isTeamLead = false) {
  if (role === "it_support") {
    return isSupportLead ? ROLE_KEYS.SUPPORT_LEAD : ROLE_KEYS.SUPPORT_AGENT;
  }
  if (role === "user" && isTeamLead) {
    return ROLE_KEYS.TEST_LEAD;
  }
  return LEGACY_ROLE_MAP[role] ?? ROLE_KEYS.QA_ENGINEER;
}

// Fail fast at import time: a typo in a role's permission list is a silent
// privilege bug otherwise.
(function validateCatalog() {
  const codes = new Set(ALL_CODES);
  if (codes.size !== ALL_CODES.length) {
    throw new Error("[access] Duplicate permission code in the catalog");
  }
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
  for (const p of PERMISSIONS) {
    if (!categoryKeys.has(p.category)) {
      throw new Error(`[access] Permission ${p.code} has unknown category ${p.category}`);
    }
    if (!/^[a-z]+\.[a-z]+$/.test(p.code)) {
      throw new Error(`[access] Permission ${p.code} is not a lowercase resource.action code`);
    }
  }
  for (const role of BUILTIN_ROLES) {
    for (const code of role.permissions) {
      if (code !== WILDCARD && !codes.has(code)) {
        throw new Error(`[access] Role ${role.key} references unknown permission ${code}`);
      }
    }
  }
})();

module.exports = {
  WILDCARD,
  CATEGORIES,
  PERMISSIONS,
  ALL_CODES,
  PLATFORM_ONLY,
  SUPPORT_DESK_ONLY,
  BUILTIN_ROLES,
  ROLE_KEYS,
  LEGACY_ROLE_MAP,
  roleKeyForLegacyUser,
};
