# Access model — TestMate

**Status:** Phase 2 deliverable (design, for review before implementation).
**Date:** 2026-09-20
**Input:** `docs/access-audit.md`

> **Roles are convenience; permissions are what the server actually checks.**
>
> Hiding a control in this app is a courtesy, not a lock. The API re-checks every one of
> these permissions on every request.

---

## 1. Principles

1. **Permissions are the unit of enforcement.** Roles are named bundles of permissions and
   nothing more. No application code may branch on a role name; it branches on
   `can(actor, 'result.enter')`.
2. **Permission codes are `resource.action`**, lowercase, single dot.
3. **Deny by default.** A route with no declared permission fails closed with 403. A route
   that is deliberately public declares that explicitly (`publicRoute(...)`), so the absence of a
   declaration is always a bug, never a policy.
4. **Separation of duties.** Whoever records a result is not automatically whoever amends it.
   Whoever reports a defect is not automatically whoever verifies the fix. Whoever operates a
   queue is not automatically whoever configures it.
5. **Permissions say what kind of thing you may touch; scoping says which rows.** Both are
   enforced on the server. Section 7 defines the scoping rule for every role.
6. **Every permission in the catalog is checked somewhere.** A permission the server
   never consults promises a capability that does not exist, which is exactly the
   confusion this model is meant to remove. Five candidates were cut for this reason:
   `organisation.read`, `organisation.manage` (no organisation-profile endpoint exists),
   `integration.manage` (its route has no principal — see G1), `notification.send`
   (notifications are side effects, never a request) and `settings.manage` (its only
   subject, the support-chat toggle, is a single global row and so belongs to
   `supportchat.manage`). `roleMatrix.spec.js` fails the build if a new one appears.
7. **The vendor and its customers are different principals.** The platform owner runs
   the platform; an organisation administrator runs one workspace. Neither inherits the
   other's controls, and no assignable role carries a platform-only permission.
8. **Organisation isolation is not a permission.** Every query is scoped to
   `actor.organizationId` (or `clientCompanyId`) *before* permissions are considered. No
   permission can grant cross-organisation access; only the wildcard super role bypasses it.

---

## 2. Permission catalog — 85 permissions in 10 categories

> Generated from `server/modules/access/catalog/permissions.catalog.js`, which is the
> single source the seed, the resolver and the tests all read. If this table and the
> code disagree, the code is right.

Legend: ⚠ = carries a warning note shown in the role editor.

### 2.1 Organisation & platform — 2
*Workspace-wide configuration and the platform controls behind it.*

| Code | Label | Description |
|---|---|---|
| `audit.read` | View activity log | Read the organisation's activity log. |
| `platform.read` ⚠ | View all organisations | Cross-organisation overview. **Warning: reads data across every organisation.** |

### 2.2 Roles & people — 7
*Who is on the team, and what they are allowed to do.*

| Code | Label | Description |
|---|---|---|
| `role.read` | View roles | See roles and their permission sets. |
| `role.manage` ⚠ | Manage roles | Create, edit and delete roles. **Warning: can grant any permission.** |
| `role.assign` ⚠ | Assign roles | Give a user a role. **Warning: can give any user any role.** |
| `user.read` | View team members | List and view team members. |
| `user.create` | Add team members | Create a team member account. |
| `user.update` | Edit team members | Edit a team member's details. |
| `user.delete` ⚠ | Remove team members | Remove a team member from the organisation. **Warning: removes the person's access immediately.** |

### 2.3 Projects — 7
*The containers everything else hangs off.*

| Code | Label | Description |
|---|---|---|
| `project.read` | View projects | See projects and their details. |
| `project.readall` | View all projects | See every project in the organisation, not only your own. |
| `project.create` | Create projects | Start a new project. |
| `project.update` | Edit projects | Change a project's name, description and metadata. |
| `project.delete` | Delete projects | Remove a project and everything in it. |
| `project.configure` | Manage project membership | Add and remove members, and set team leads. |
| `project.export` | Export projects | Download a project or suite as a spreadsheet. |

### 2.4 Test authoring — 12
*Suites, test cases, their notes, and bulk import.*

| Code | Label | Description |
|---|---|---|
| `suite.read` | View test suites | See suites and their contents. |
| `suite.manage` | Manage test suites | Create, edit and delete suites. |
| `testcase.read` | View test cases | See test cases and their steps. |
| `testcase.create` | Write test cases | Draft a new test case. |
| `testcase.update` | Edit test cases | Change an existing test case. |
| `testcase.delete` | Delete test cases | Remove a test case. |
| `testcase.approve` | Activate test cases | Move a case from Draft to Active. |
| `testcase.deprecate` | Retire test cases | Move an Active case to Deprecated. |
| `testcase.assign` | Assign testers | Choose who runs a test case. |
| `import.run` | Run bulk import | Import test cases from a spreadsheet. |
| `note.read` | View case notes | Read notes on a test case and notes recorded during runs. |
| `note.manage` | Write case notes | Add and delete notes. |

### 2.5 Test execution — 9
*Runs, and the results recorded against them.*

| Code | Label | Description |
|---|---|---|
| `run.read` | View test runs | See runs and their progress. |
| `run.create` | Start test runs | Open a new run. |
| `run.update` | Edit test runs | Change a run's details while it is in progress. |
| `run.delete` | Delete test runs | Remove a run and its results. |
| `run.close` | Close test runs | Mark a run complete, freezing its results. |
| `result.read` | View results | See recorded pass, fail, blocked and skipped outcomes. |
| `result.enter` | Record results | Record the outcome of executing a test case. |
| `result.amend` ⚠ | Amend closed results | Change a result after its run has been closed. **Warning: every change is audited.** |
| `result.delete` | Delete results | Remove a recorded result. |

### 2.6 Defects & feature requests — 14
*Work raised against a project, from report through to closure.*

| Code | Label | Description |
|---|---|---|
| `bug.read` | View bugs | See reported bugs. |
| `bug.create` | Report bugs | Raise a new bug. |
| `bug.update` | Edit bugs | Change a bug's description and details. |
| `bug.delete` | Delete bugs | Remove a bug report. |
| `bug.triage` | Triage bugs | Set severity, priority and assignee. |
| `bug.verify` | Verify fixes | Move a Fixed bug to Verified. |
| `bug.close` | Close bugs | Close a bug, or reopen a closed one. |
| `featurerequest.read` | View feature requests | See feature requests. |
| `featurerequest.create` | Raise feature requests | Submit a new feature request. |
| `featurerequest.update` | Edit feature requests | Change a request's details. |
| `featurerequest.delete` | Delete feature requests | Remove a feature request. |
| `featurerequest.decide` | Decide feature requests | Move a request through review to Planned, Done or Rejected. |
| `featurerequest.vote` | Vote on feature requests | Add or remove a vote. |
| `featurerequest.comment` | Comment on feature requests | Post and delete thread comments. |

### 2.7 Customer tickets — 8
*Feedback submitted through a project's public form, and its triage.*

| Code | Label | Description |
|---|---|---|
| `ticket.read` | View tickets | See submitted tickets and their history. |
| `ticket.assign` | Assign tickets | Route a ticket to a team member. |
| `ticket.update` | Update ticket status | Advance a ticket through its working stages. |
| `ticket.resolve` | Resolve tickets | Mark a ticket resolved. |
| `ticket.close` | Close tickets | Close a resolved ticket. |
| `ticket.delete` | Delete tickets | Remove a ticket. |
| `ticket.comment` | Reply to tickets | Post in a ticket's conversation thread. |
| `form.configure` ⚠ | Configure the public form | Enable, rotate or disable a project's public form link. **Warning: rotating a link breaks every form already shared.** |

### 2.8 Support desk — 10
*External client companies and the queue their IT supporters work.*

| Code | Label | Description |
|---|---|---|
| `supportqueue.read` | View support queue | See the client company's ticket queue. |
| `supportqueue.update` | Advance queue items | Move an item through logged, acknowledged and investigating. |
| `supportqueue.assign` | Route queue items | Assign an item to a teammate. |
| `supportqueue.resolve` | Resolve queue items | Close an item fixed locally. |
| `supportqueue.escalate` | Escalate to the product team | Hand an item over with a severity. |
| `supportqueue.send` | Notify submitters | Email the end user about their item. |
| `company.read` | View client companies | See client company records. |
| `company.manage` | Manage client companies | Create, edit and delete client companies. |
| `company.autoassign` | Configure auto-assign | Set how incoming queue items are routed within a client company. |
| `supporter.manage` | Manage supporters | Add, remove and promote a company's IT supporters. |

### 2.9 Conversations & broadcasts — 11
*Live chat, in-app support chat, and messages sent to everyone.*

| Code | Label | Description |
|---|---|---|
| `livechat.read` | View live chat | Read the operator inbox and visitor list. |
| `livechat.send` | Reply in live chat | Send a message to a visitor. |
| `livechat.assign` | Assign conversations | Route a conversation to an operator. |
| `livechat.manage` | Manage conversations | Change a conversation's status. |
| `livechat.configure` | Configure the widget | Change a project's widget presentation settings. |
| `widget.configure` ⚠ | Configure the widget link | Enable, rotate or disable a project's widget link. **Warning: rotating a link breaks every embedded widget.** |
| `supportchat.read` | View support chat inbox | Read in-app conversations with the platform team. |
| `supportchat.send` | Reply in support chat | Respond in an in-app support conversation. |
| `supportchat.manage` | Manage support chat | Close conversations, and turn the platform-wide support chat on or off. |
| `announcement.manage` | Manage announcements | Write, publish and delete product announcements. |
| `banner.publish` ⚠ | Broadcast site banner | Show a banner to everyone on the platform. **Warning: shown to every user on the platform.** |

### 2.10 Reporting & analytics — 5
*Management reporting.*

| Code | Label | Description |
|---|---|---|
| `dashboard.read` | View dashboard | See the dashboard overview and recent runs. |
| `analytics.read` | View analytics | Organisation-wide breakdowns of bugs, requests and throughput. |
| `analytics.team` | View team performance | Per-person performance reporting. |
| `sla.read` | View SLA reports | See SLA attainment and ticket timings. |
| `sla.configure` | Configure SLA targets | Change the SLA rules the whole organisation is measured against. |

### 2.11 The wildcard

| Code | Label | Description |
|---|---|---|
| `*` | All permissions | Implies every permission in the catalog, including permissions added later. Held only by the locked Super administrator role. |

---

## 3. Roles

Every role is **built-in** (fixed name, not deletable, permission set still editable) or
**custom** (fully editable and deletable, only when it has zero members). Built-in roles show
a **Built-in** badge and the note:

> A built-in role. Its name is fixed, but you can still change what it may do.

| Role | Kind | Permissions | Replaces |
|---|---|---:|---|
| Super administrator | built-in, **locked** | `*` | `superadmin` |
| Organisation administrator | built-in | 72 | `admin` |
| Test lead | built-in | 41 | `user` who leads a project (`project_members.role = team_lead`) |
| QA engineer | built-in | 30 | `user` |
| Tester | built-in | 21 | — (new) |
| Support lead | built-in | 11 | `it_support` + `is_support_lead` |
| Viewer | built-in | 13 | — (new) |

**QA manager, Support manager and Support agent are not built-in.** They were in the first
release and were dropped as unnecessary. An organisation that had them keeps them as ordinary
**custom roles** — same members, same permissions — which an admin can edit or delete once
empty (see *Retired built-in roles* under Seeding). A manager-style split for a new
organisation is a custom role away.

**A supporter who is not a lead has no built-in role.** Support lead is the only built-in role
carrying `supportqueue.*`, so an `it_support` account that is not a lead has no permissions
until an admin assigns a role. Organisation administrators do not hold `supportqueue.*`
themselves, so — under the no-escalation rule — they cannot grant it: assigning Support lead,
or building a role that carries the queue permissions, is a super administrator's job.

### 3.1 Super administrator — locked
One wildcard permission, `*`. Shown with a lock icon. Cannot be edited, renamed,
deleted, or have its permissions changed through the UI or the API. This is the platform
owner.

It is the vendor's role, not the customer's, so it is **hidden from everyone but a super
administrator**: it is absent from an organisation administrator's role list, and fetching,
cloning or assigning it by id returns 404, as for another organisation's role.

### 3.2 Organisation administrator — 72
Everything inside one customer's workspace, and nothing outside it.

This is **not** "every permission in the catalog". TestMate is multi-tenant, so
"administrator" means two different principals, and the catalog keeps them apart:

- **Platform-only** — `platform.read`, `announcement.manage`, `banner.publish`,
  `supportchat.read` / `.send` / `.manage`: cross-organisation reporting, product
  announcements, the site banner, and the in-app inbox customers write *to*. These
  belong to the vendor. They are reachable only through the locked super
  administrator's wildcard and are held by no assignable role.
- **Support-desk-only** — `supportqueue.*` and `company.autoassign`: an external client
  company's own queue. The product team sees one of their tickets only once it is
  escalated, and then through `ticket.read` like any other ticket.

Defining this role as "all permissions" put the vendor's controls into every customer
admin's sidebar. `roleMatrix.spec.js` now fails the build if either boundary is crossed.

```
audit.read, role.read, role.manage, role.assign, user.read, user.create,
user.update, user.delete, project.read, project.readall, project.create,
project.update, project.delete, project.configure, project.export,
suite.read, suite.manage, testcase.read, testcase.create, testcase.update,
testcase.delete, testcase.approve, testcase.deprecate, testcase.assign,
import.run, note.read, note.manage, run.read, run.create, run.update,
run.delete, run.close, result.read, result.enter, result.amend,
result.delete, bug.read, bug.create, bug.update, bug.delete, bug.triage,
bug.verify, bug.close, featurerequest.read, featurerequest.create,
featurerequest.update, featurerequest.delete, featurerequest.decide,
featurerequest.vote, featurerequest.comment, ticket.read, ticket.assign,
ticket.update, ticket.resolve, ticket.close, ticket.delete, ticket.comment,
form.configure, company.read, company.manage, supporter.manage,
livechat.read, livechat.send, livechat.assign, livechat.manage,
livechat.configure, widget.configure, dashboard.read, analytics.read,
analytics.team, sla.read, sla.configure
```

### 3.3 Test lead — 41
Supervisor and approver inside their own projects. Enters data *and* approves it, but
cannot close the loop on published outcomes or touch configuration.

```
user.read, project.read, project.export, suite.read, suite.manage,
testcase.read, testcase.create, testcase.update, testcase.approve,
testcase.assign, import.run, note.read, note.manage, run.read, run.create,
run.update, run.close, result.read, result.enter, bug.read, bug.create,
bug.update, bug.triage, bug.verify, featurerequest.read,
featurerequest.create, featurerequest.update, featurerequest.vote,
featurerequest.comment, ticket.read, ticket.assign, ticket.update,
ticket.resolve, ticket.comment, livechat.read, livechat.send,
livechat.assign, livechat.manage, dashboard.read, analytics.read, sla.read
```

**Notably lacks:** `result.amend`, `testcase.deprecate`, `testcase.delete`, `bug.close`, `bug.delete`, `featurerequest.decide`, `featurerequest.delete`, `ticket.close`, `analytics.team`, `project.readall`.

### 3.4 QA engineer — 30
Authors test cases and executes them. **Cannot approve anything.**

```
user.read, project.read, project.export, suite.read, suite.manage,
testcase.read, testcase.create, testcase.update, testcase.assign, import.run,
note.read, note.manage, run.read, run.create, run.update, result.read,
result.enter, bug.read, bug.create, bug.update, featurerequest.read,
featurerequest.create, featurerequest.update, featurerequest.vote,
featurerequest.comment, ticket.read, ticket.comment, livechat.read,
livechat.send, dashboard.read
```

### 3.5 Tester — 21
Executes the cases assigned to them and reports what they find. No authoring, no
assignment, no bulk import.

```
user.read, project.read, suite.read, testcase.read, note.read, note.manage,
run.read, run.create, result.read, result.enter, bug.read, bug.create,
bug.update, featurerequest.read, featurerequest.create, featurerequest.vote,
featurerequest.comment, ticket.read, ticket.comment, livechat.read,
dashboard.read
```

### 3.6 Support lead — 11
The IT support lead at a client company. Sees only their own company's queue.

```
supportqueue.read, supportqueue.update, supportqueue.assign,
supportqueue.resolve, supportqueue.escalate, supportqueue.send, company.read,
company.autoassign, supporter.manage, audit.read, sla.read
```

### 3.7 Viewer — 13
A stakeholder who needs to see quality status across the organisation without touching
anything.

```
project.read, project.readall, suite.read, testcase.read, note.read,
run.read, result.read, bug.read, featurerequest.read, ticket.read,
dashboard.read, analytics.read, sla.read
```

---

## 4. Separation of duties, spelled out

| Workflow | Writes | Approves | Finalises |
|---|---|---|---|
| Test case lifecycle | `testcase.create` / `testcase.update` — QA engineer, Test lead | `testcase.approve` (Draft → Active) — Test lead | `testcase.deprecate` — Organisation administrator |
| Test run | `result.enter` — Tester, QA engineer, Test lead | `run.close` — Test lead | `result.amend` (post-closure) — Organisation administrator only ⚠ |
| Defect lifecycle | `bug.create` / `bug.update` — anyone testing | `bug.triage`, `bug.verify` — Test lead | `bug.close` — Organisation administrator |
| Feature request | `featurerequest.create` / `.update` — QA engineer, Test lead | `featurerequest.decide` — Organisation administrator | — |
| Customer ticket | `ticket.update`, `ticket.comment` — Test lead | `ticket.resolve` — Test lead | `ticket.close`, `ticket.delete` — Organisation administrator |
| Support queue (external) | `supportqueue.update` — Support lead, or a custom supporter role | `supportqueue.assign` — Support lead only | `supportqueue.escalate` — either, hands over to the product team |

Two hard splits, both mirroring the reference model's finance/academic split:

- **Configuration is confined to administrators.** `settings.manage`, `sla.configure`,
  `form.configure`, `widget.configure`, `role.manage` are held by no
  engineering role.
- **The customer-facing surface is split from the engineering surface.** The engineering
  roles (Test lead, QA engineer, Tester) have no `form.configure`, `company.manage` or
  `sla.configure`, and the external support roles have no `testcase.*`, `run.*` or
  `result.*`.

**A reporter cannot verify their own fix.** `bug.create` and `bug.verify` are never both
needed by the same person for the same bug — Tester and QA engineer hold `bug.create` without
`bug.verify`; Test lead and Organisation administrator hold `bug.verify`. This is the model's
answer to gap G12.

---

## 5. Record-level scoping rules

Permissions decide *what kind of thing* you may touch. Scoping decides *which rows*. Scoping
is enforced in repository queries and service guards, **never in the UI**. The existing
scoping layer (`ProjectService.assertAccess`, `SlaService.scopeFor`, client-company filters)
is kept intact and sits *below* the permission check.

The scoping questions themselves are answered by named helpers in
`server/shared/access/scope.js`, so "what an actor can see" is still derived from role data
rather than a role name:

| Helper | Answers |
|---|---|
| `seesAllProjects(actor)` | `project.readall` — every project in the organisation, or only your own. This is what `actor.role === UserRole.USER` used to express. |
| `isExternalSupporter(actor)` | Has a `client_company_id`, i.e. sits on the customer side of the boundary. |
| `isOrphanedSupporter(actor)` | Works a support queue but has no company attached — a broken account, denied outright rather than scoped to the organisation. |
| `seesOrganisationAnalytics(actor)` | `analytics.read` — organisation-wide reporting, or only your own slice. |
| `isAdministrativeAudience(actor)` | Counts as an admin for "admins only" broadcasts. Not an authorisation check. |

These are never a substitute for a permission check: the route's `requirePermission` has
already run by the time any of them is called.

| Role | Scoping rule |
|---|---|
| **Super administrator** | None. The only principal that crosses organisation boundaries. |
| **Organisation administrator** | Every row where `organization_id = actor.organizationId`. |
| **Test lead** | Organisation, further narrowed to **projects the user is a member of**. Management actions (`suite.manage`, `testcase.*`, `run.close`, `bug.triage`, `ticket.assign`) additionally require `project_members.role = 'team_lead'` **for that project** — the existing `ProjectService.assertCanManageProject` bar, now layered under the permission rather than replacing it. |
| **QA engineer** | Organisation, narrowed to projects the user is a member of. Read access also extends to any project containing a test case assigned to them (existing legacy behaviour in `ProjectService.assertAccess`, preserved). |
| **Tester** | Organisation, narrowed to **test cases assigned to the user** and the suites/projects containing them. `result.enter` is additionally restricted to results for cases assigned to them — the existing check in `TestRunResultService`, preserved. |
| **Viewer** | Organisation-wide read. **Assumption:** a Viewer is an internal stakeholder (engineering manager, product owner) who should see every project in the organisation, not just ones they belong to. If a narrower Viewer is wanted, it becomes a custom role with project membership applied. |
| **Support lead** | Every query filtered to `client_company_id = actor.clientCompanyId`. `supportqueue.assign`, `company.autoassign` and `supporter.manage` additionally require `users.is_support_lead = true`, and `supporter.manage` cannot touch the **primary** lead — that stays `company.manage` (product team). |
| **A supporter who is not a lead** (custom role) | Same `client_company_id` filter. Queue items are further narrowed to unassigned items plus those assigned to the actor. |

### Public principals

The three unauthenticated principals from the audit are **not** given roles. They keep their
token-based access, which is a separate authentication mechanism, and their routes declare
`publicRoute(...)` so they satisfy deny-by-default explicitly:

- Public ticket submitter — `projects.feedback_token`, plus email + one-time code for history.
- Live-chat visitor — `projects.live_chat_token`, then a server-issued `visitorId`.
- Partner integration — see gap G1 below.

---

## 6. Lockout and escalation guards

| Guard | Rule |
|---|---|
| **Locked role** | The Super administrator role cannot be edited, renamed, deleted, or stripped of `*`. Enforced in the service, not just hidden in the UI. |
| **Last `role.manage` role** | `role.manage` cannot be removed from the last role in an organisation that holds it. |
| **Last `role.manage` holder** | The last user in an organisation holding a role with `role.manage` cannot have that role removed, be deleted, or be deactivated. |
| **Last super administrator** | The last user holding the Super administrator role cannot have it removed or be deleted. |
| **Self-demotion** | A user may not remove their own last `role.manage`-bearing role. |
| **No privilege escalation** | A holder of `role.manage` who is **not** a super administrator may not grant a permission they do not themselves hold, nor assign a role containing one. Super administrators bypass this (they hold `*`). |
| **Only what you hold is shown** | A non-super administrator sees only the permissions they hold themselves: in the editor's catalog (a category with none left is dropped), and in each role's permission list and count. A role can carry more — Support lead has the client company's `supportqueue.*` — and that remainder is kept when the role is edited, and left out of a copy. Nothing they cannot grant is ever offered. |
| **Built-in role deletion** | Built-in roles cannot be deleted at any time. |
| **Custom role deletion** | Only when the role has zero members. |

Because `role.manage` can grant any permission, it is treated as effectively
administrator-level throughout: it is held only by Super administrator and Organisation
administrator in the seeded set.

---

## 7. Data model

```
permissions
  code           varchar(64) PK        -- 'result.amend'
  category       varchar(40)           -- 'execution'
  label          varchar(120)          -- 'Amend closed results'
  description    text
  warning        text NULL             -- 'Every change is audited'
  sort_order     int

permission_categories
  key            varchar(40) PK        -- 'execution'
  label          varchar(80)           -- 'Test execution'
  description    text                  -- one line, shown under the card heading
  sort_order     int

roles
  id             uuid PK
  organization_id uuid NULL            -- NULL = platform-level (super admin role)
  key            varchar(60)           -- stable seed key, e.g. 'qa_engineer'
  name           varchar(80)
  description    text
  is_builtin     boolean
  is_locked      boolean
  created_at / updated_at
  UNIQUE (organization_id, key)
  UNIQUE (organization_id, lower(name))

role_permissions
  role_id        uuid FK -> roles(id) ON DELETE CASCADE
  permission_code varchar(64) FK -> permissions(code)
  PK (role_id, permission_code)

user_roles
  user_id        uuid FK -> users(id) ON DELETE CASCADE
  role_id        uuid FK -> roles(id) ON DELETE CASCADE
  granted_by     uuid NULL FK -> users(id)
  granted_at     timestamptz
  PK (user_id, role_id)
```

Roles are **per organisation** so that one customer's custom roles are invisible to another.
Built-in roles are seeded once per organisation (on registration and by backfill). The Super
administrator role is the single exception: `organization_id IS NULL`, platform-wide, and
visible only to a super administrator.

### Seeding

Idempotent, and safe to re-run:

- **Permissions and categories** are upserted by primary key. Labels, descriptions, warnings
  and sort order are refreshed on every run; the catalog is code-owned.
- **Built-in roles** are created if absent (matched on `organization_id` + `key`) with their
  designed permission set. If a role already exists, **its permission set is left alone** —
  an admin's customisation of a built-in role survives every re-seed and every deploy.
- `--reset-builtin-permissions` is an explicit opt-in flag that restores built-in roles to
  their designed sets. Nothing else resets them.
- New permissions added to the catalog later are **not** silently added to existing roles.
  They appear unchecked in the role editor, which is the deny-by-default behaviour.

#### Retired built-in roles

A built-in role dropped from the catalog is **converted, never deleted**. For every
organisation that has a copy, the role loses its seed key and its built-in flag and becomes
an ordinary custom role: its members and permissions are untouched, so nobody loses access,
and an admin can rename it, edit it, or delete it once it has no members. (Deleting it would
strip its members' access, and a built-in role cannot be deleted through the API.)

This is what `RETIRED_ROLE_KEYS` in the catalog lists — currently `qa_manager`,
`support_manager` and `support_agent`. It runs in migrations
`1783300000000-RetireQaAndSupportManagerRoles` and `1783310000000-RetireSupportAgentRole`
(the second exists so a database that already ran the first is still converted) and again in
every seed, and is idempotent: once converted, a role no longer matches. Rolling either
migration back does nothing, on purpose: re-flagging a role an admin may since have edited as
built-in would let the seed overwrite it.

### Deployment order

**The migration must run before the new server code starts.** `permissionsMiddleware` resolves
permissions from `user_roles` on every authenticated request; if those tables do not exist
yet it answers 503 rather than failing open, so booting the new code against an unmigrated
database locks everyone out until `migration:run` completes. Standard migrate-then-deploy
ordering, but worth stating because the failure mode is total rather than partial.

After deploying, `npm run seed:access` is safe to run at any time and repairs an organisation
whose roles were never provisioned.

### Migration of existing users

`users.role` is retained (not dropped) for one release. A data migration grants:

| Existing | Granted role |
|---|---|
| `role = 'superadmin'` | Super administrator |
| `role = 'admin'` | Organisation administrator |
| `role = 'user'`, leads no project | QA engineer |
| `role = 'user'`, leads at least one project (`project_members.role = team_lead`) | Test lead |
| `role = 'it_support'`, `is_support_lead = true` | Support lead |
| `role = 'it_support'`, `is_support_lead = false` | *(none — see below)* |

A supporter who is not a lead was granted Support agent when this migration first ran. That role
has since been retired, so a non-lead supporter whose account is created or backfilled *now* gets
no role; those who already held it keep it, as a custom role.

No existing user loses access: each new role is a superset of what its old role could reach
at the route level, and every service-level scoping check is preserved unchanged.

`project_members.role`, `users.is_support_lead` and `users.is_primary_support_lead` are
**kept as-is**. They are record-scoping facts, not app-wide grants, and section 5 layers
them under the permission checks.

---

## 8. Enforcement design

### Server

```js
// shared/access/can.js
can(actor, 'result.enter')            // boolean; true if any of the actor's roles grants it, or '*'
requirePermission('result.enter')     // Express middleware -> 403 on failure
requireAny('bug.triage','bug.verify') // Express middleware, union
requireAuthenticatedOnly(reason)      // signed in, no permission needed (own profile etc.)
publicRoute(reason)                   // explicit opt-out, satisfies deny-by-default
assertPermission(actor, code)         // service-layer guard, throws AppError(403)
hasWildcard(actor)                    // super administrator only, for the escalation guard
```

- `authMiddleware` continues to decode the JWT. A new `permissionsMiddleware` resolves the
  caller's effective permissions **from the database** and attaches them to `req.user`, with a
  short-lived per-process cache keyed by user id, invalidated on any role or assignment write.
  This is why permissions are *not* baked into the access token: a role edit must take effect
  immediately, which is what the "N members" impact warning in the UI promises.
- `shared/access/routeAudit.js` walks the mounted router tree at boot. A route that declares
  nothing has a denying handler **spliced into the front of its stack**, so it fails closed at
  request time as well as being named loudly in the log. `routeCoverage.spec.js` asserts the
  list is empty, so it also fails the build. This is the fix for gap G8.
- Some permissions are enforced below the route, because the action shares an endpoint with a
  less-privileged one — a status transition on an update endpoint. `testcase.approve`,
  `testcase.deprecate`, `run.close`, `bug.triage`, `bug.verify`, `bug.close`,
  `featurerequest.decide`, `ticket.assign`, `ticket.resolve`, `ticket.close` and
  `result.amend` are checked with `assertPermission` in the owning service.
  `roleMatrix.spec.js` keeps that list honest: a catalog permission that is neither on a route
  nor named there fails the build.

### Audit

Every role change, permission change and role assignment writes to the existing
`activity_logs` table with `action` in:

`role.created`, `role.updated`, `role.deleted`, `role.permissions_changed`,
`role.assigned`, `role.unassigned`

and `metadata` carrying `{ before, after }`. Sensitive domain actions — `result.amend` above
all — write the same before/after shape. Reading the log requires `audit.read`.

### Client

`can(code)` comes from `AuthContext`, populated by `GET /api/v1/auth/me` (and by the login
response, so a fresh sign-in routes correctly without waiting for `/me`). `nav.ts` items carry
`permission?: string`; `ProtectedRoute` takes `anyOf?: string[]`. `lib/can.ts` mirrors the
server helper, wildcard included.

Role preview changed with it: previewing a lower role borrows **that role's real permission
set** from the roles list, because swapping only the role name would show a lower role's
navigation while leaving every admin control visible.

One deliberate divergence from the permission a route checks: the Team page's navigation item
and route are gated on `user.create`, not `user.read`. Engineers hold `user.read` so the
assignee picker works, but the page exists to manage people — this is the UI being *stricter*
than the API, which is the safe direction and matches what the app did before.

All of this is **for usability only** — the footer notice on the Roles & access page says so.

### API surface

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/access/permissions` | `role.read` |
| GET | `/api/v1/access/roles` | `role.read` |
| GET | `/api/v1/access/roles/:id` | `role.read` |
| POST | `/api/v1/access/roles` | `role.manage` |
| PATCH | `/api/v1/access/roles/:id` | `role.manage` |
| DELETE | `/api/v1/access/roles/:id` | `role.manage` |
| PUT | `/api/v1/users/:id/roles` | `role.assign` |

`GET /api/v1/roles` returns each role's `permissionCount` and `memberCount`, so the UI can
show impact before an edit.

---

## 9. Gaps from the audit, and how this model answers them

| Gap | Resolution |
|---|---|
| G1 unauthenticated `integrations/companies` | **Not fixed.** A permission model cannot secure a route with no principal, and the route is left as-is by decision. It is declared `publicRoute(...)` so it is visible rather than forgotten, and there is deliberately no `integration.manage` permission — a permission nothing checks would be a lie in the role editor. |
| G2 long-lived public tokens | Unchanged. `form.configure` / `widget.configure` now gate rotation with a warning note. |
| G3 site banner read is superadmin-only | Fixed: reading the current banner needs no permission (any authenticated user); `banner.publish` gates broadcasting. |
| G4 widget settings open to `user` | Fixed: `livechat.configure`, held by administrators only. |
| G5 import confirm open to any internal role | Fixed: `import.run`. |
| G6 bulk assignee change | Fixed: `testcase.assign`. |
| G7 undeclared notification routes | Fixed: declared explicitly; still self-scoped. |
| G8 no deny-by-default | Fixed: boot-time assertion plus fail-closed default. |
| G9/G10/G11 UI-only and drifting checks | Fixed: one catalog, one `can()`, shared shape on both sides. |
| G12/G13 ~70 hard-coded role checks | Migrated to `can(actor, code)`. Checks are replaced, not layered. |
| G14 implicit privilege granting | Fixed: `role.assign` + the no-escalation guard. |
| G15 no lockout protection | Fixed: section 6. |
| G16 `it_support` excluded by omission | Fixed: external roles hold only `supportqueue.*` / `company.*`; the internal surface is unreachable by construction. |

---

## 10. Decisions taken, and what is still open

### Still open

1. **G1 — `POST /api/v1/integrations/companies` is unauthenticated.** *Decided: left as-is
   for now.* A permission model cannot secure a route with no principal, and closing it is a
   breaking change for any partner already calling it. The route is declared
   `publicRoute("...UNAUTHENTICATED, see audit gap G1")` so it is visible rather than
   forgotten, and no `integration.manage` permission exists, because a permission nothing
   checks would be a lie in the role editor. The options when it is picked up: a per-project
   API key stored hashed and sent as `X-TestMate-Key` (recommended), an HMAC signature over
   the body, or an allowlist of partner IPs. **Whichever is chosen, existing partners must be
   issued credentials before it ships.**

### Decided

2. **Viewer scope — organisation-wide.** A Viewer is an internal stakeholder who should see
   quality status across every project without being added to each one, so the role holds
   `project.readall`. A narrower Viewer is a custom role away.
3. **Role granularity — 7 seeded.** The migration is lossless: a legacy `user` who leads
   a project becomes a Test lead and everyone else a QA engineer, so nobody loses a capability
   they have today. Promoting people into Tester or Viewer is a manual follow-up an admin can
   do from the Team screen whenever they like. QA manager, Support manager and Support agent
   were seeded at first and dropped as unnecessary; see *Retired built-in roles*.
