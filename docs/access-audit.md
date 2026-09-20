# Access audit — TestMate

**Status:** Phase 1 deliverable (read-only audit). No code was changed to produce this.
**Date:** 2026-09-20
**Resolution:** each gap below is answered in `docs/access-model.md` section 9. This file is
deliberately left as the "before" picture rather than updated in place.
**Scope:** `server/` (Express + TypeORM + PostgreSQL API) and `client/` (React 19 + Vite + React Router 7 SPA).

This document inventories who can currently do what in TestMate, how that is enforced,
and where the enforcement has gaps. It is the input to `docs/access-model.md`, which
designs the permission catalog that replaces the current role checks.

---

## 1. Principals: who exists and how they are identified

### 1.1 Authenticated application users

All authenticated users are rows in the `users` table (`modules/auth/entities/user.entity.js`).
Authentication is a **bearer JWT access token** (`Authorization: Bearer <token>`), verified by
`shared/middleware/auth.middleware.js`, which decodes the token and assigns the payload to
`req.user`. There is **no database lookup on the request path** — the token payload *is* the
identity. The payload is built in `AuthService.issueTokens`
(`modules/auth/services/auth.service.js:37`):

```js
{ id, email, role, organizationId, clientCompanyId, isSupportLead }
```

Login is local (bcrypt password) or Google OAuth (`provider` column: `local` | `google`).
Refresh tokens are persisted and hashed in `refresh_tokens`. Email verification and password
reset run through `otp_codes`.

There is exactly **one app-wide role column**: `users.role`, a Postgres enum over
`UserRole` (`config/constants.js`):

| Role | Constant | Meaning today |
|---|---|---|
| `superadmin` | `UserRole.SUPERADMIN` | The platform owner / developer. Cross-organisation visibility, publishes announcements and site banners, runs the support-chat inbox. Seeded by `scripts/seedSuperadmin.js`. |
| `admin` | `UserRole.ADMIN` | The company admin who registered the account. **This is the default role on registration.** Owns their organisation: team management, projects, client companies, SLA rules, public form links. |
| `user` | `UserRole.USER` | A member added by a company admin. QA / testers. Scoped to projects they belong to or test cases assigned to them. |
| `it_support` | `UserRole.IT_SUPPORT` | An **external** IT supporter employed by a *client company* that uses one of the org's products. Locked out of projects and dashboards entirely; sees only their own company's ticket queue at `/support`. |

### 1.2 Sub-role dimensions layered on top of `users.role`

These are not roles in the enum, but they gate behaviour exactly like roles do. Any
permission model has to account for them:

| Dimension | Where stored | Effect |
|---|---|---|
| **Project team lead** | `project_members.role` = `team_lead` or `member` (`ProjectMemberRole`) | A `user` who is a team lead sees every suite and case in that project and may manage it (`ProjectService.canManageProject`). A plain `member` only sees what they are assigned. Purely per-project. |
| **Support lead** | `users.is_support_lead` (boolean) | An `it_support` account that may assign queue items to teammates and manage the company's supporter roster. |
| **Primary support lead** | `users.is_primary_support_lead` (boolean) | At most one per client company. Peer leads cannot demote or remove them — only a TestMate admin can. |
| **Org owner** | derived (`UserService.isOrgOwner`) | The registering admin. Cannot be edited or deleted by peers. Surfaced to the client as `User.isOrgOwner`. |

### 1.3 Unauthenticated principals

Three distinct anonymous callers exist. None of them have a `users` row, and none pass
through `authMiddleware`. Their credential is an opaque token in the URL or body:

| Principal | Credential | Routes |
|---|---|---|
| **Public ticket submitter** | `projects.feedback_token` (UUID, shareable). Ticket history additionally proves ownership with email plus a one-time code (`feedback_lookup_codes`). | `/api/v1/public/feedback/*` (8 routes) |
| **Live-chat website visitor** | `projects.live_chat_token` (UUID) to bootstrap, then a server-issued `visitorId`; optionally a `live_chat_accounts` password login. | `/api/v1/public/live-chat/*` (9 routes) |
| **Partner integration server** | None. Identifies its target by `projectId` in the body; rate limiting is the only guard. | `POST /api/v1/integrations/companies` (1 route) |

### 1.4 Implied principals with no representation

- **Guest / logged-out app visitor** — served the marketing site, legal pages and docs. No API identity.
- **Background jobs** — none scheduled. Socket.IO presence updates (`infrastructure/realtime/socketServer.js`) write `users.last_seen_at` as a side effect of a connection, authenticated by the same access token.

---

## 2. Feature areas and the actions inside them

Action classes used below: **R** read · **W** create/update/delete · **A** approve/decide ·
**P** publish/broadcast · **D** destructive · **C** configuration · **$** commercially
sensitive (SLA / analytics / contractual).

### 2.1 Projects

| Action | Class | Current gate |
|---|---|---|
| List / view projects | R | `authorise(superadmin, admin, user)`; service narrows `user` to memberships and assignments |
| Export a project (xlsx) | R | same |
| Create project | W | `authorise(superadmin, admin)` |
| Update project | W | `authorise(superadmin, admin)` |
| Delete project | D | `authorise(superadmin, admin)` — soft delete |
| Manage project members and team leads | C | inside the project update payload, admin-only |

### 2.2 Test suites, cases, notes, attachments, import

| Action | Class | Current gate |
|---|---|---|
| Read suites / cases / notes / run-notes / attachments | R | `authorise(superadmin, admin, user)`, service-scoped for `user` |
| Create / update / delete suite | W/D | `authorise(superadmin, admin, user)` then `assertCanManageProject` (team lead or admin) in the service |
| Create / update / delete case | W/D | same |
| Assign testers to a case (single or bulk) | W | same |
| Add / delete case notes | W/D | route allows any internal role |
| Upload / delete attachments | W/D | route allows any internal role |
| Download import template | R | any internal role |
| Upload sheet, preview import | W | any internal role |
| Confirm import (bulk create) | W | any internal role |
| Export suite (xlsx) | R | any internal role |

### 2.3 Test runs and results

| Action | Class | Current gate |
|---|---|---|
| List / view runs, results, run attachments | R | any internal role |
| Create run | W | any internal role, then service scoping |
| Update / delete run | W/D | any internal role |
| Record a result (`pass` / `fail` / `blocked` / `skipped`) | W | any internal role; a `user` may only record against cases assigned to them |
| Bulk-update results | W | any internal role |
| Delete result | D | any internal role |
| Upload / delete result attachments | W/D | any internal role |

### 2.4 Bugs

| Action | Class | Current gate |
|---|---|---|
| List / view bugs, by reference code | R | any internal role |
| Report a bug | W | any internal role |
| Update a bug (status, severity, priority, assignee) | W/A | any internal role; the service allows the original reporter to edit their own report, otherwise the project-manage bar |
| Delete a bug | D | any internal role, then service bar |
| Bug attachments (list / upload / delete) | R/W/D | any internal role |

### 2.5 Feature requests

| Action | Class | Current gate |
|---|---|---|
| List / view / by code | R | any internal role |
| Create | W | any internal role |
| Update (status transitions `new` through `done` / `rejected`) | A | any internal role, then service bar |
| Delete | D | any internal role, then service bar |
| Vote | W | any internal role |
| Comment / delete comment | W/D | any internal role |
| Attachments | R/W/D | any internal role |

### 2.6 Feedback and ticket triage (product-team side)

| Action | Class | Current gate |
|---|---|---|
| List tickets (per project or cross-project) | R | `authorise(superadmin, admin, user)`, service-scoped |
| Update ticket status / assignee | A | route: internal roles; **service**: admin or the project's team lead |
| Read status history | R | internal roles |
| Delete ticket | D | route: internal roles; service: admin or team lead |
| Read / post ticket comments | R/W | internal roles; posting needs admin, team lead or assignee |
| **Enable / rotate / disable a project's public form link** | C | `authorise(superadmin, admin)` |

### 2.7 IT support portal (client-company side)

| Action | Class | Current gate |
|---|---|---|
| View own company's queue | R | `authorise(it_support)` plus service scoping to `clientCompanyId` |
| Advance working stage (`logged` to `acknowledged` to `investigating`) | W | `authorise(it_support)` |
| Assign / unassign to a teammate | A | `authorise(it_support)` plus a **lead-only** service check |
| List teammates (assign dropdown) | R | `authorise(it_support)` plus lead-only |
| Resolve a ticket | A | `authorise(it_support)` |
| Escalate to the product team (sets severity) | A | `authorise(it_support)` |
| Notify submitter | send | `authorise(it_support)` |
| Read / post comments | R/W | `authorise(it_support)` plus the assigned-supporter / lead bar for posting |

### 2.8 Client companies

| Action | Class | Current gate |
|---|---|---|
| List / create / update / delete companies | W/D | `authorise(superadmin, admin)` |
| Set a company's public form link | C | `authorise(superadmin, admin)` |
| View own company | R | `authorise(it_support)` |
| List / add / remove supporters | W/D | `authorise(superadmin, admin, it_support)` plus service: the company's own lead, scoped to their own company. **Adding** is self-service only, except to bootstrap a company with no supporters. |
| Toggle a supporter's lead flag | C | same |
| Designate the **primary** lead | C | `authorise(superadmin, admin)` — never self-service |
| Set auto-assign | C | `authorise(it_support)` only — **no admin fallback at all** |

### 2.9 Live chat (operator inbox and widget config)

| Action | Class | Current gate |
|---|---|---|
| Read conversations / messages / visitors | R | any internal role, membership service-enforced |
| Send message, mark read | W | any internal role |
| Assign conversation, update status | A | any internal role |
| Read / update per-project widget settings | C | any internal role — **see gap G4** |
| **Enable / rotate / disable widget link** | C | `authorise(superadmin, admin)` |

### 2.10 SLA

| Action | Class | Current gate |
|---|---|---|
| Overview, tickets, filter options | R $ | `authorise(superadmin, admin, user, it_support)`; `SlaService.scopeFor` narrows each role |
| Read SLA settings (targets) | R | same viewers list |
| **Update SLA rules / targets** | C $ | `authorise(superadmin, admin)` |

### 2.11 Team and user administration

| Action | Class | Current gate |
|---|---|---|
| List company members | R | `authorise(superadmin, admin, user)` — deliberately open so leads can pick assignees |
| View one user | R | `authorise(superadmin, admin)` |
| Create a user (and set their role) | C | `authorise(superadmin, admin)` — **this is the privilege-granting action today** |
| Update a user (including changing their role) | C | `authorise(superadmin, admin)` plus org-owner and cross-org guards in the service |
| Delete a user | D | `authorise(superadmin, admin)` plus the same guards |

### 2.12 Dashboard and analytics

| Action | Class | Current gate |
|---|---|---|
| Overview KPIs | R | internal roles; a `user` sees only their own slice |
| Recent runs | R | internal roles |
| **Top performers, feature-request breakdown, bug breakdown** | R $ | computed **only for admin / superadmin** inside `DashboardService` — an in-service role check, not a route check |
| Cross-organisation overview | R $ | `authorise(superadmin)` |

### 2.13 Activity log (existing audit trail)

| Action | Class | Current gate |
|---|---|---|
| Read activity | R | `authorise(superadmin, admin, it_support)`; `it_support` narrowed to their `clientCompanyId` |
| Write activity | — | internal only; services call it directly, never over HTTP |

### 2.14 Platform administration

| Action | Class | Current gate |
|---|---|---|
| Cross-org overview (`/platform`) | R | `authorise(superadmin)` |
| Publish app update / announcement (single, bulk) | P | `authorise(superadmin)` |
| Delete announcements (bulk) | D | `authorise(superadmin)` |
| See unseen announcements, mark seen | R/W | any authenticated user |
| Broadcast site banner | P | `authorise(superadmin)` |
| Deactivate site banner | P | `authorise(superadmin)` |
| **Read current site banner** | R | `authorise(superadmin)` — **see gap G3** |
| Support-chat inbox: list, read, reply, close | R/W | `authorise(superadmin)` |
| Toggle support chat globally | C | `authorise(superadmin)` |

### 2.15 Self-service (every authenticated user)

Profile, password change, onboarding flag, notification-sound flag, notifications list,
unread count, mark read, and their own support-chat conversation. Gated by `authMiddleware`
only; the service always scopes to `req.user.id`.

---

## 3. API endpoint inventory and what each currently checks

**175 route registrations** across 29 router files, mounted under `/api/v1` in `app.js`.
Grouped by the guard actually applied:

| Guard | Routes | Notes |
|---|---:|---|
| `authorise("superadmin","admin","user")` | ~95 | The dominant pattern. Means *"any internal user"*. Carries **no** distinction between reading a test case and deleting a project's data. |
| `authMiddleware` only (any authenticated role) | 14 | Auth self-service, notifications, app-update seen/unseen, site-banner read. |
| No auth at all (public / token) | 18 | `public/feedback` (8), `public/live-chat` (9), `integrations/companies` (1). |
| Unauthenticated auth endpoints | 8 | register, login, refresh, google, verify, resend, forgot, reset — rate-limited. |
| `authorise("superadmin","admin")` | ~18 | Project and user writes, client companies, SLA settings, form and widget links. |
| `authorise("superadmin")` | ~15 | Platform administration, support-chat inbox, site banner. |
| `authorise("it_support")` | ~12 | Support portal, own-company self-service. |
| `authorise("superadmin","admin","it_support")` | 4 | Activity log, supporter-roster management. |
| `authorise("superadmin","admin","user","it_support")` | 4 | SLA viewers. |

The important structural fact: **`authorise()` is a role-name allowlist**
(`shared/middleware/authorise.middleware.js`). It tests `roles.includes(req.user?.role)`
and nothing else. There is no permission concept anywhere in the codebase.

### Second enforcement tier: in-service role checks

Route guards are deliberately coarse; the real decision is frequently taken inside the
service layer. Grepping for role comparisons across `server/modules` finds **roughly 70
distinct hard-coded role checks in 22 service and repository files**, including:

- `ProjectService.canManageProject` / `assertCanManageProject` / `isTeamLead` / `assertAccess` — the project-management bar used by suites, cases, runs, bugs, feature requests and feedback.
- `UserService.isSuperadmin`, `isOrgOwner` — cross-org and org-owner protection.
- `SlaService.scopeFor` / `filtersFor` — per-role data scoping.
- `DashboardService` — `isAdmin` decides whether analytics blocks are computed at all.
- `FeedbackService` / `FeedbackCommentService` / `FeedbackSupportService` — `it_support` company scoping and lead checks.
- `ClientCompanyService` — nine separate `UserRole.IT_SUPPORT` comparisons implementing self-service versus admin rules.
- `AppUpdateRepository` — `role === "superadmin"` inlined into a SQL audience filter.
- `SiteBannerService`, `SupportChatService`, `ActivityService`, `TestCaseService`, `TestSuiteService`, `TestRunService`, `TestRunResultService`, `TestCaseExportService`, `BugService`, `FeatureRequestService`, `LiveChatService`, `NotificationService`.

This is the surface that has to be migrated: each check is a business rule expressed as a
role name, and each one is a candidate permission.

---

## 4. UI controls gated on identity

### 4.1 Route gating

`client/src/App.tsx` wraps route groups in `<ProtectedRoute roles={[...]}>`
(`client/src/components/ProtectedRoute.tsx`), which redirects to `homePathForRole(user.role)`
on mismatch:

| Route group | Allowed roles |
|---|---|
| `/settings` | any authenticated |
| `/dashboard`, `/projects/*`, `/all-feedback` | `superadmin`, `admin`, `user` |
| `/support`, `/support/activity`, `/support/sla` | `it_support` |
| `/team`, `/activity` | `superadmin`, `admin` |
| `/platform`, `/announcements`, `/support-inbox` | `superadmin` |

### 4.2 Navigation gating

`client/src/components/layout/nav.ts` carries a `roles?: Role[]` field per `NavItem`, filtered
by `navForRole` and `navBottomForRole`. `homePathForRole` sends `it_support` to `/support` and
everyone else to `/dashboard`. `ROLE_LABEL` maps the four enum values to display strings.

### 4.3 In-page gating

Role comparisons appear in roughly 20 client components, among them:
`SettingsPage.tsx` (the Admin tab is `superadmin`-only), `TeamPage.tsx` and `UserFormDialog.tsx`
(role badge, and the role dropdown when creating a member), `ProjectsPage.tsx`,
`ProjectDetailPage.tsx`, `ProjectFormDialog.tsx`, `DashboardPage.tsx` (analytics cards),
`FeedbackTab.tsx`, `SupportersDialog.tsx`, `LiveChatTab.tsx`, `SlaDashboard.tsx`,
`SlaTicketsDialog.tsx`, `AllFeedbackPage.tsx`, `CommentThread.tsx`, `CaseNotesSection.tsx`,
`SupportChatWidget.tsx`, `PreviewBanner.tsx`, `OnboardingTour.tsx`, `LandingHeader.tsx`,
`tourGuides.ts`.

Every one of these is a direct `user.role === UserRole.X` or `INTERNAL_ROLES.includes(...)`
comparison. There is no client-side capability helper.

---

## 5. Existing role / permission code to migrate or replace

| Artefact | Path | Disposition |
|---|---|---|
| `UserRole` enum | `server/config/constants.js` | **Keep** as the seed key for built-in roles and for the existing `users.role` column during migration; stop using it for decisions. |
| `ProjectMemberRole` enum | `server/config/constants.js` | **Keep.** Per-project membership is record-level scoping, not an app-wide permission — it stays orthogonal. |
| `authorise(...roles)` middleware | `server/shared/middleware/authorise.middleware.js` | **Replace** with `requirePermission(code)`. Keep the file exporting a deprecated shim only if a route cannot be mapped. |
| `authMiddleware` | `server/shared/middleware/auth.middleware.js` | **Extend** — must load the caller's effective permissions (see the note on the JWT below). |
| `Actor` type | `server/shared/types/actor.ts` | **Extend** with resolved permissions. |
| `users.role` column | `users` table | **Retain** for one release as the migration source; the new `user_roles` table becomes the source of truth. |
| `users.is_support_lead` / `is_primary_support_lead` | `users` table | **Keep** — these are record-scoping flags within a client company, not app-wide grants. |
| `project_members.role` | `project_members` table | **Keep** — record-level scoping. |
| ~70 in-service role comparisons | the 22 files listed in section 3 | **Migrate** to `can(actor, code)`; do not layer permission checks on top of surviving role checks. |
| `activity_logs` table and `ActivityService` | `server/modules/activity/*` | **Reuse** as the audit log for role and permission changes. It already has actor, org, action, entity, summary, jsonb metadata and timestamps — enough to carry before and after values. |
| `scripts/seedSuperadmin.js` | `server/scripts/` | **Extend** to also grant the super-administrator role row. |
| `nav.ts` `roles` field, `ProtectedRoute` `roles` prop | `client/src/components/layout/nav.ts`, `client/src/components/ProtectedRoute.tsx` | **Replace** with a `permission` / `anyOf` field driven by a client `can()`. |
| `ROLE_LABEL` | `client/src/components/layout/nav.ts` | **Replace** with server-supplied role names once roles are data. |

### Note on the JWT

`req.user` is decoded straight from the access token with no database read. If permissions
were baked into the token, a role edit would not take effect until the token expired — which
directly contradicts the "N members" impact warning in the Roles & access UI. **Effective
permissions must be resolved per request from the database**, with a short-lived in-process
cache keyed by user id, invalidated on any role or assignment write. The token keeps carrying
`id`, `organizationId` and `clientCompanyId`, which are stable identity facts, and may keep
carrying `role` for one release as a fallback.

---

## 6. Gaps

### Unprotected or under-protected endpoints

| # | Gap | Detail | Severity |
|---|---|---|---|
| **G1** | `POST /api/v1/integrations/companies` has **no authentication of any kind** | Anyone who learns a `projectId` can create a client company plus its first IT support lead — that is, mint an account that can read that company's ticket queue. Rate limiting is the only control, and the code comments acknowledge this. | **High** |
| **G2** | Public feedback and live-chat tokens are long-lived shared secrets | `projects.feedback_token` and `live_chat_token` are UUIDs embedded in URLs; possession is full authority to submit and to list that form's tickets (`GET /:token/tickets`). Rotation exists, but there is no expiry and no per-submitter scoping on the listing route. | Medium |
| **G3** | `GET /api/v1/site-banner/current` is gated to `superadmin` | The comment directly above it says *"Every authenticated role must be able to read the current banner"*, but the guard is `authorise("superadmin")`. The banner is invisible to everyone else — a live bug the permission migration should fix. | Medium (correctness) |
| **G4** | `PATCH /api/v1/live-chat/projects/:id/settings` is open to the `user` role | Widget presentation config is configuration, and every sibling configuration route (form link, widget link) is admin-only. Membership is checked, but a plain member of any project can reconfigure that project's public-facing widget. | Medium |
| **G5** | Test-case **import confirm** is open to any internal role | `POST /test-cases/import/:importId/confirm` bulk-creates cases with only the internal-role guard; there is no `assertCanManageProject` equivalent at the route. | Medium |
| **G6** | `PATCH /test-cases/assignees/bulk` is open to any internal role | Bulk reassignment across many cases with route-level `user` access. | Low–Medium |
| **G7** | Notification routes carry no authorisation declaration | `authMiddleware` only. Correct in practice (the service scopes to `req.user.id`), but it **fails open by convention, not by construction** — a future handler that forgets to scope has no backstop. | Low |
| **G8** | No deny-by-default | A newly added route with no `authorise(...)` is reachable by every authenticated principal, including `it_support`. Nothing in the framework forces a declaration. | **High (systemic)** |

### UI-only checks

| # | Gap |
|---|---|
| **G9** | `DashboardService` decides analytics visibility with `isAdmin` inside the service — correct — but the client separately hides the same cards with its own role test. The two can drift; there is a single source of truth for neither. |
| **G10** | `/team` is a `superadmin` / `admin` route on the client, while `GET /api/v1/users` deliberately allows the `user` role. The UI is stricter than the API. Not a hole (the API is scoped), but it means the UI is *not* a reliable description of what the API permits — exactly the situation the new model's footer notice addresses. |
| **G11** | Client role comparisons are scattered across roughly 20 components with no shared helper, so there is no single place to keep UI visibility aligned with server enforcement. |

### Hard-coded role checks

| # | Gap |
|---|---|
| **G12** | Roughly 70 role-name comparisons across 22 server files (section 3). Each encodes a business rule that cannot be changed without a deploy. An admin cannot, for example, let a senior tester approve feature-request status changes. |
| **G13** | `AppUpdateRepository` inlines `role === "superadmin"` into a SQL predicate (`u.audience = 'admins' AND :isAdmin`), so the rule lives in a query string. |
| **G14** | Privilege granting is implicit: whoever can `POST /api/v1/users` chooses the new user's `role`, so `admin` is transitively able to mint another `admin`. There is no explicit "may grant privileges" capability, and no guard preventing an actor from granting more than they hold. |
| **G15** | No lockout protection anywhere. `UserService` protects the org owner from deletion, but nothing prevents an organisation from ending up with zero users who can administer it. |
| **G16** | `it_support` is enforced as *"not an internal role"* by omission — it is simply left out of the `authorise("superadmin","admin","user")` allowlist on roughly 95 routes. Any new route that lists roles carelessly leaks the internal product surface to external supporters. |

---

## 7. Summary

TestMate has a **four-value role enum checked by name in two places** — a route-level
allowlist and roughly seventy inline service comparisons — with a third, parallel set of
checks in the client. Roles are code, not data: they cannot be created, edited, or
inspected by an administrator, and their member counts are unknowable without a query.

The structural problems, in order of importance:

1. **No deny-by-default** (G8). Authorisation is opt-in per route.
2. **No unit of enforcement smaller than a role** (G12). `authorise("superadmin","admin","user")` on 95 routes means read and destroy are the same privilege.
3. **No privilege-granting control** (G14). Role assignment is an ordinary user-update field.
4. **One genuinely unauthenticated privileged endpoint** (G1) and two under-protected configuration routes (G3, G4).
5. **Client and server checks are independent implementations of the same rules** (G9–G11).

What is already in good shape and should be preserved rather than replaced:

- **Record-level scoping is real and already server-side** — `ProjectService.assertAccess`, `SlaService.scopeFor`, the `it_support` company scoping. The new model keeps this layer intact and adds permissions *above* it.
- **`activity_logs`** is a usable audit sink with an actor, a jsonb metadata column and org scoping.
- **The service layer already receives an `Actor`**, so a `can(actor, code)` helper drops in without re-plumbing controllers.

Next: `docs/access-model.md`.
