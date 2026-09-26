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
    description: "Who can see, export and create projects. What someone can DO inside a project is set by their role in that project.",
  },
  {
    key: "support",
    label: "Support desk",
    description: "External client companies and the queue their IT supporters work.",
  },
  {
    key: "conversations",
    label: "Platform inbox & broadcasts",
    description: "The in-app support inbox and messages sent to every user — the platform owner's, not any one organisation's.",
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
  // The platform-level counterpart of project.readall. Everything ELSE about a
  // project -- suites, cases, runs, bugs, tickets, membership -- is decided by the
  // person's role IN that project (project_members.role). This one grant exists
  // because two things cannot be project-level: creating a project (there is no
  // project yet to hold a role in) and managing one you are not on (a project
  // whose lead has left would otherwise be unmanageable for ever).
  { code: "project.manageall", category: "projects", label: "Manage all projects", description: "Create projects, and act as team lead on every project in the organisation.", warning: "Full control of every project, including deleting it" },
  { code: "project.export", category: "projects", label: "Export projects", description: "Download a project or suite as a spreadsheet." },





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

  // ── Platform inbox & broadcasts ────────────────────────────────────────────
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
// then as an ordinary project ticket, by role in that project.
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
  TEST_LEAD: "test_lead",
  QA_ENGINEER: "qa_engineer",
  TESTER: "tester",
  SUPPORT_LEAD: "support_lead",
  VIEWER: "viewer",
});

// Built-in roles that were once seeded and no longer are. Where an organisation
// already has one, the seed keeps it — members and permissions untouched — as an
// ordinary custom role, so an admin can delete it once it is empty. See
// retireBuiltinRoles in accessSeed.service.
const RETIRED_ROLE_KEYS = Object.freeze(["qa_manager", "support_manager", "support_agent"]);

// What is left at the platform level, once everything about working INSIDE a
// project has moved to the project's own roles (project_members.role: member or
// team_lead). The three engineering roles below therefore differ only in what
// they may export and see in reporting; what each person can do in a given
// project comes from their role there, not from anything in this list.
const QA_ENGINEER_PERMISSIONS = [
  "user.read",
  "project.read", "project.export",
  "dashboard.read",
];

// A Tester is a QA engineer who does not export projects.
const TESTER_REMOVES = ["project.export"];

const SUPPORT_LEAD_PERMISSIONS = [
  "supportqueue.read", "supportqueue.update", "supportqueue.assign",
  "supportqueue.resolve", "supportqueue.escalate", "supportqueue.send",
  "company.read", "company.autoassign", "supporter.manage",
  "audit.read", "sla.read",
];

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
    key: ROLE_KEYS.TEST_LEAD,
    name: "Test lead",
    description:
      "Exports projects and sees analytics and SLA reporting. What they can do inside a project comes from their role in that project.",
    permissions: [
      "user.read",
      "project.read", "project.export",
      "dashboard.read", "analytics.read", "sla.read",
    ],
  },
  {
    key: ROLE_KEYS.QA_ENGINEER,
    name: "QA engineer",
    description:
      "Works in the projects they belong to and can export them. What they can do in each comes from their role there.",
    permissions: QA_ENGINEER_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.TESTER,
    name: "Tester",
    description:
      "Works in the projects they belong to. What they can do in each comes from their role there.",
    permissions: without(QA_ENGINEER_PERMISSIONS, TESTER_REMOVES),
  },
  {
    key: ROLE_KEYS.SUPPORT_LEAD,
    name: "Support lead",
    description: "The IT support lead at a client company. Sees only their own company's queue.",
    permissions: SUPPORT_LEAD_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.VIEWER,
    name: "Viewer",
    description:
      "Sees quality status across every project in the organisation and changes nothing: read-only in every project they are not on.",
    permissions: [
      "project.read", "project.readall",
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
  // it_support splits on users.is_support_lead — see roleKeyForLegacyUser.
});

// `isTeamLead` is true when the user leads at least one project
// (project_members.role = 'team_lead'). What they can DO in that project comes
// from that membership, not from this role, so the mapping no longer carries any
// capability. It is kept because Test lead is still the closest description of
// the person, and because changing it would move people between roles for no
// reason.
//
// Returns null when there is no built-in role to give: a supporter who is not a
// lead. An admin assigns them a role instead (a custom one, or Support lead).
function roleKeyForLegacyUser(role, isSupportLead, isTeamLead = false) {
  if (role === "it_support") {
    return isSupportLead ? ROLE_KEYS.SUPPORT_LEAD : null;
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
    if (RETIRED_ROLE_KEYS.includes(role.key)) {
      throw new Error(`[access] Role ${role.key} is retired and must not be seeded`);
    }
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
  RETIRED_ROLE_KEYS,
  LEGACY_ROLE_MAP,
  roleKeyForLegacyUser,
};
