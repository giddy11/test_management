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
   that is deliberately public declares that explicitly (`public()`), so the absence of a
   declaration is always a bug, never a policy.
4. **Separation of duties.** Whoever records a result is not automatically whoever amends it.
   Whoever reports a defect is not automatically whoever verifies the fix. Whoever operates a
   queue is not automatically whoever configures it.
5. **Permissions say what kind of thing you may touch; scoping says which rows.** Both are
   enforced on the server. Section 7 defines the scoping rule for every role.
6. **Organisation isolation is not a permission.** Every query is scoped to
   `actor.organizationId` (or `clientCompanyId`) *before* permissions are considered. No
   permission can grant cross-organisation access; only the wildcard super role bypasses it.

---

## 2. Permission catalog — 89 permissions in 10 categories

Legend: ⚠ = carries a warning note shown in the role editor.

### 2.1 Organisation & platform — 6
*Workspace-wide configuration and the platform controls behind it.*

| Code | Label | Description |
|---|---|---|
| `organisation.read` | View organisation | See the organisation profile and its settings. |
| `organisation.manage` | Manage organisation | Edit the organisation profile. |
| `settings.manage` | Manage workspace settings | Change workspace-wide defaults, including the support-chat toggle. |
| `audit.read` | View activity log | Read the organisation's activity log. |
| `platform.read` ⚠ | View all organisations | Cross-organisation overview. **Warning: reads data across every organisation.** |
| `integration.manage` ⚠ | Manage integrations | Server-to-server provisioning access. **Warning: controls unauthenticated machine access.** |

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
| `user.delete` ⚠ | Remove team members | **Warning: removes the person's access immediately.** |

### 2.3 Projects — 6
*The containers everything else hangs off.*

| Code | Label | Description |
|---|---|---|
| `project.read` | View projects | See projects and their details. |
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
| `result.read` | View results | See recorded pass/fail/blocked/skipped outcomes. |
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
| `company.configure` | Configure a client company | Auto-assign rules and the primary lead. |
| `supporter.manage` | Manage supporters | Add, remove and promote a company's IT supporters. |

### 2.9 Conversations & broadcasts — 12
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
| `supportchat.manage` | Manage support chat | Close conversations and toggle support chat. |
| `announcement.manage` | Manage announcements | Write, publish and delete product announcements. |
| `banner.publish` ⚠ | Broadcast site banner | **Warning: shown to every user on the platform.** |
| `notification.send` | Send notifications | Trigger notifications to other users. |

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
| Organisation administrator | built-in | 89 (all) | `admin` |
| QA manager | built-in | 47 | — (new) |
| Test lead | built-in | 43 | `user` + `project_members.role = team_lead` |
| QA engineer | built-in | 30 | `user` |
| Tester | built-in | 21 | — (new) |
| Support manager | built-in | 34 | — (new, product-side) |
| Support lead | built-in | 11 | `it_support` + `is_support_lead` |
| Support agent | built-in | 8 | `it_support` |
| Viewer | built-in | 12 | — (new) |

### 3.1 Super administrator — locked
One wildcard permission, `*`. Shown with a lock icon. Cannot be edited, renamed, deleted, or
have its permissions changed through the UI or the API. This is the platform owner.

### 3.2 Organisation administrator — 89
Every permission in the catalog. The everyday owner role for a customer organisation,
deliberately distinct from the locked super role: it can be edited, and its holders are still
confined to their own organisation by scoping.

### 3.3 QA manager — 47
Approval and closure authority with full visibility, and **no operational data entry**. Sets
quality policy; does not run tests.

```
organisation.read, audit.read,
role.read, user.read,
project.read, project.create, project.update, project.configure, project.export,
suite.read, suite.manage, testcase.read, testcase.approve, testcase.deprecate,
testcase.assign, note.read,
run.read, run.create, run.update, run.close, result.read, result.amend,
bug.read, bug.triage, bug.verify, bug.close,
featurerequest.read, featurerequest.decide, featurerequest.vote, featurerequest.comment,
ticket.read, ticket.assign, ticket.update, ticket.resolve, ticket.close, ticket.comment,
supportqueue.read, company.read,
livechat.read, livechat.assign, livechat.manage, supportchat.read, notification.send,
dashboard.read, analytics.read, analytics.team, sla.read
```

**Notably lacks:** `role.manage`, `role.assign`, `settings.manage`, `user.create` /
`user.update` / `user.delete`, `project.delete`, `result.enter`, `testcase.create` /
`testcase.update`, `import.run`, `sla.configure`, `form.configure`, `widget.configure`.

### 3.4 Test lead — 43
Supervisor and approver inside their projects. Enters data *and* approves it, but cannot
close the loop on published outcomes or touch configuration.

```
organisation.read,
user.read,
project.read, project.export,
suite.read, suite.manage, testcase.read, testcase.create, testcase.update,
testcase.approve, testcase.assign, import.run, note.read, note.manage,
run.read, run.create, run.update, run.close, result.read, result.enter,
bug.read, bug.create, bug.update, bug.triage, bug.verify,
featurerequest.read, featurerequest.create, featurerequest.update,
featurerequest.vote, featurerequest.comment,
ticket.read, ticket.assign, ticket.update, ticket.resolve, ticket.comment,
livechat.read, livechat.send, livechat.assign, livechat.manage,
dashboard.read, analytics.read, sla.read
```

**Notably lacks:** `result.amend`, `testcase.deprecate`, `testcase.delete`, `bug.close`,
`bug.delete`, `featurerequest.decide`, `featurerequest.delete`, `ticket.close`,
`analytics.team`, and everything in Organisation & platform beyond `organisation.read`.

> QA manager (47) and Test lead (43) are close in size but deliberately different in kind.
> The manager approves and never enters; the lead enters and approves within their own
> projects. Compare the two "notably lacks" lists rather than the counts.

### 3.5 QA engineer — 30
Authors test cases and executes them. **Cannot approve anything.**

```
user.read,
project.read, project.export,
suite.read, suite.manage, testcase.read, testcase.create, testcase.update,
testcase.assign, import.run, note.read, note.manage,
run.read, run.create, run.update, result.read, result.enter,
bug.read, bug.create, bug.update,
featurerequest.read, featurerequest.create, featurerequest.update,
featurerequest.vote, featurerequest.comment,
ticket.read, ticket.comment,
livechat.read, livechat.send,
dashboard.read
```

### 3.6 Tester — 21
The QA engineer set minus `suite.manage`, `testcase.create`, `testcase.update`,
`testcase.assign`, `import.run`, `project.export`, `featurerequest.update`, `run.update` and
`livechat.send`. Executes the cases assigned to them and reports what they find.

```
user.read, project.read,
suite.read, testcase.read, note.read, note.manage,
run.read, run.create, result.read, result.enter,
bug.read, bug.create, bug.update,
featurerequest.read, featurerequest.create, featurerequest.vote, featurerequest.comment,
ticket.read, ticket.comment,
livechat.read, dashboard.read
```

### 3.7 Support manager — 34
Product-side owner of customer tickets and client company relationships. No test authoring
or execution at all — the customer-facing half of the business, fully split from the
engineering half.

```
organisation.read, audit.read,
user.read, project.read,
bug.read, bug.create, featurerequest.read, featurerequest.create,
ticket.read, ticket.assign, ticket.update, ticket.resolve, ticket.close,
ticket.delete, ticket.comment, form.configure,
supportqueue.read, company.read, company.manage, company.configure, supporter.manage,
livechat.read, livechat.send, livechat.assign, livechat.manage, livechat.configure,
widget.configure, supportchat.read, supportchat.send, notification.send,
dashboard.read, analytics.read, sla.read, sla.configure
```

### 3.8 Support lead — 11 (external)
The IT support lead at a client company. Sees only their own company's queue.

```
supportqueue.read, supportqueue.update, supportqueue.assign, supportqueue.resolve,
supportqueue.escalate, supportqueue.send,
company.read, company.configure, supporter.manage,
audit.read, sla.read
```

### 3.9 Support agent — 8 (external)
The Support lead set minus `supportqueue.assign`, `company.configure` and
`supporter.manage`. Works their own assigned items; cannot route work or change the roster.

```
supportqueue.read, supportqueue.update, supportqueue.resolve, supportqueue.escalate,
supportqueue.send, company.read, audit.read, sla.read
```

### 3.10 Viewer — 12 (internal, read-only)
A stakeholder who needs to see quality status without touching anything.

```
project.read, suite.read, testcase.read, note.read, run.read, result.read,
bug.read, featurerequest.read, ticket.read,
dashboard.read, analytics.read, sla.read
```

---

## 4. Separation of duties, spelled out

| Workflow | Writes | Approves | Finalises |
|---|---|---|---|
| Test case lifecycle | `testcase.create` / `testcase.update` — QA engineer, Test lead | `testcase.approve` (Draft → Active) — Test lead, QA manager | `testcase.deprecate` — QA manager |
| Test run | `result.enter` — Tester, QA engineer, Test lead | `run.close` — Test lead, QA manager | `result.amend` (post-closure) — QA manager only ⚠ |
| Defect lifecycle | `bug.create` / `bug.update` — anyone testing | `bug.triage`, `bug.verify` — Test lead, QA manager | `bug.close` — QA manager |
| Feature request | `featurerequest.create` / `.update` — QA engineer, Test lead | `featurerequest.decide` — QA manager | — |
| Customer ticket | `ticket.update`, `ticket.comment` — Test lead, Support manager | `ticket.resolve` — Test lead, Support manager | `ticket.close`, `ticket.delete` — Support manager, QA manager |
| Support queue (external) | `supportqueue.update` — Support agent | `supportqueue.assign` — Support lead only | `supportqueue.escalate` — either, hands over to the product team |

Two hard splits, both mirroring the reference model's finance/academic split:

- **Configuration is confined to administrators.** `settings.manage`, `sla.configure`,
  `form.configure`, `widget.configure`, `integration.manage`, `role.manage` are held by no
  engineering role.
- **The customer-facing surface is split from the engineering surface.** Support manager has
  no `testcase.*`, `run.*` or `result.*`. QA manager has no `form.configure`,
  `company.manage` or `sla.configure`.

**A reporter cannot verify their own fix.** `bug.create` and `bug.verify` are never both
needed by the same person for the same bug — Tester and QA engineer hold `bug.create` without
`bug.verify`; Test lead and QA manager hold `bug.verify`. This is the model's answer to
gap G12.

---

## 5. Record-level scoping rules

Permissions decide *what kind of thing* you may touch. Scoping decides *which rows*. Scoping
is enforced in repository queries and service guards, **never in the UI**. The existing
scoping layer (`ProjectService.assertAccess`, `SlaService.scopeFor`, client-company filters)
is kept intact and sits *below* the permission check.

| Role | Scoping rule |
|---|---|
| **Super administrator** | None. The only principal that crosses organisation boundaries. |
| **Organisation administrator** | Every row where `organization_id = actor.organizationId`. |
| **QA manager** | Same as Organisation administrator: whole organisation, read and approve. |
| **Support manager** | Whole organisation for tickets, companies, chat and SLA. Client companies are further limited to those linked to a project in the actor's organisation. |
| **Test lead** | Organisation, further narrowed to **projects the user is a member of**. Management actions (`suite.manage`, `testcase.*`, `run.close`, `bug.triage`, `ticket.assign`) additionally require `project_members.role = 'team_lead'` **for that project** — the existing `ProjectService.assertCanManageProject` bar, now layered under the permission rather than replacing it. |
| **QA engineer** | Organisation, narrowed to projects the user is a member of. Read access also extends to any project containing a test case assigned to them (existing legacy behaviour in `ProjectService.assertAccess`, preserved). |
| **Tester** | Organisation, narrowed to **test cases assigned to the user** and the suites/projects containing them. `result.enter` is additionally restricted to results for cases assigned to them — the existing check in `TestRunResultService`, preserved. |
| **Viewer** | Organisation-wide read. **Assumption:** a Viewer is an internal stakeholder (engineering manager, product owner) who should see every project in the organisation, not just ones they belong to. If a narrower Viewer is wanted, it becomes a custom role with project membership applied. |
| **Support lead** | Every query filtered to `client_company_id = actor.clientCompanyId`. `supportqueue.assign`, `company.configure` and `supporter.manage` additionally require `users.is_support_lead = true`, and `supporter.manage` cannot touch the **primary** lead — that stays `company.manage` (product team). |
| **Support agent** | Same `client_company_id` filter. Queue items are further narrowed to unassigned items plus those assigned to the actor. |

### Public principals

The three unauthenticated principals from the audit are **not** given roles. They keep their
token-based access, which is a separate authentication mechanism, and their routes declare
`public()` so they satisfy deny-by-default explicitly:

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
  key            varchar(60)           -- stable seed key, e.g. 'qa_manager'
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
administrator role is the single exception: `organization_id IS NULL`, platform-wide.

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

### Migration of existing users

`users.role` is retained (not dropped) for one release. A data migration grants:

| Existing | Granted role |
|---|---|
| `role = 'superadmin'` | Super administrator |
| `role = 'admin'` | Organisation administrator |
| `role = 'user'` | QA engineer |
| `role = 'it_support'`, `is_support_lead = true` | Support lead |
| `role = 'it_support'`, `is_support_lead = false` | Support agent |

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
public()                              // explicit opt-out, satisfies deny-by-default
assertPermission(actor, code)         // service-layer guard, throws AppError(403)
```

- `authMiddleware` continues to decode the JWT. A new `permissionsMiddleware` resolves the
  caller's effective permissions **from the database** and attaches them to `req.user`, with a
  short-lived per-process cache keyed by user id, invalidated on any role or assignment write.
  This is why permissions are *not* baked into the access token: a role edit must take effect
  immediately, which is what the "N members" impact warning in the UI promises.
- A router-level guard asserts at boot that **every registered route** declares either a
  permission or `public()`. A route that declares nothing fails closed at request time *and*
  fails the test suite at build time. This is the fix for gap G8.

### Audit

Every role change, permission change and role assignment writes to the existing
`activity_logs` table with `action` in:

`role.created`, `role.updated`, `role.deleted`, `role.permissions_changed`,
`role.assigned`, `role.unassigned`

and `metadata` carrying `{ before, after }`. Sensitive domain actions — `result.amend` above
all — write the same before/after shape. Reading the log requires `audit.read`.

### Client

`can(code)` from an `AccessContext` populated by `GET /api/v1/auth/me`, which now returns the
caller's roles and flattened effective permissions. `nav.ts` items carry `permission?: string`
instead of `roles?: Role[]`; `ProtectedRoute` takes `permission` instead of `roles`. This is
**for usability only** — the footer notice in the Roles & access page says so explicitly.

### API surface

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/permissions` | `role.read` |
| GET | `/api/v1/roles` | `role.read` |
| GET | `/api/v1/roles/:id` | `role.read` |
| POST | `/api/v1/roles` | `role.manage` |
| PATCH | `/api/v1/roles/:id` | `role.manage` |
| DELETE | `/api/v1/roles/:id` | `role.manage` |
| PUT | `/api/v1/users/:id/roles` | `role.assign` |

`GET /api/v1/roles` returns each role's `permissionCount` and `memberCount`, so the UI can
show impact before an edit.

---

## 9. Gaps from the audit, and how this model answers them

| Gap | Resolution |
|---|---|
| G1 unauthenticated `integrations/companies` | Out of scope for a permission model — it has no principal. Flagged for a human decision (section 10). |
| G2 long-lived public tokens | Unchanged. `form.configure` / `widget.configure` now gate rotation with a warning note. |
| G3 site banner read is superadmin-only | Fixed: reading the current banner needs no permission (any authenticated user); `banner.publish` gates broadcasting. |
| G4 widget settings open to `user` | Fixed: `livechat.configure`, held by Support manager and administrators only. |
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

## 10. Open questions for a human

1. **G1 — `POST /api/v1/integrations/companies` is unauthenticated.** A permission model
   cannot secure a route with no principal. The options are a per-project API key, an HMAC
   signature over the body, or an allowlist of partner IPs. Recommendation: a per-project
   API key stored hashed, sent as `X-TestMate-Key`. **This is a behaviour change for existing
   partners and needs a decision before implementation.**
2. **Viewer scope.** Section 5 assumes a Viewer sees every project in the organisation. If
   Viewers should be limited to projects they are members of, say so — it is a one-line change
   to the scoping rule.
3. **Role granularity.** This model replaces 4 roles with 10. The migration is lossless, but
   an organisation's existing `user`-role members all become QA engineer; promoting the right
   people to Test lead or Tester is a manual follow-up. An alternative is to seed only the 5
   roles that map 1:1 and leave the other 5 as templates. Recommendation: seed all 10 — the
   extra roles are the point of the exercise, and unassigned roles cost nothing.
