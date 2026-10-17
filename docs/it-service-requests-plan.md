# IT Service Request Management — study and build plan

**Status:** Phases 1, 1b, 2 and 3 built, not yet migrated or tested (decisions in §0 approved 2026-10-17).

### Phase 3 (story 2): automation, connectors and AI

The guiding rule (story 2, BR 2.1): **rules decide, AI advises, nothing skips a mandatory approval.**

- **Automation rules** (`domain/automationRules.ts`, pure). These run once, at submit, in
  order; every matching rule applies.
  - Conditions: category, item, priority, risk, "for a new starter", form answer equals,
    title/description contains.
  - Actions: set priority, assign to an IT agent, flag for review (with a reason), add an
    internal note, approve automatically.
  - Every matched rule writes an automation-run row (AC 2.9).
- **Automatic approval** needs *both* a rule that asks for it *and* an item that allows it. Even
  then it only happens for **low-risk**, **non-privileged** items that need **no identity check**
  and aren't flagged for review. Otherwise the request goes to its approvers as normal, and the
  run records why automation stepped aside. Auto-approved requests are marked and audited.
- **Flag for review** (AC 2.6): a "Needs review" badge in the queue. While flagged, a request
  can't be approved or fulfilled automatically. An agent clears the flag.
- **Fulfilment connectors** (per catalog item):
  - **Manual:** what Phase 1 does.
  - **Webhook:** when a request reaches IT, the item checks pass, approvals are complete and the
    identity check is done (if required), TestMate POSTs a signed payload
    (`X-TestMate-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`) to the connector, for
    example Power Automate, Logic Apps or n8n, along with a one-time callback URL.
    - The endpoint either replies `{ "status": "succeeded" | "failed" }` straight away, or calls
      back later.
    - Network errors, 408, 429 and 5xx are retried after 1, 5 and 15 minutes. Other 4xx responses
      fail at once.
    - No result within 24 hours counts as failed.
    - A failure flags the request for review, tells IT (AC 2.11), and an agent can **retry** or
      **handle it manually** (AC 2.10).
    - Connector URLs and secrets are sealed with `secretBox`. TestMate never holds credentials for
      the target systems; those stay in the customer's automation tool (least privilege).
  - **Self-service link (deflect):** the item shows a link (for example, the identity provider's
    password reset). Using it records the request as *fulfilled by self-service*. "I still need
    IT" falls back to the normal form.
- **Identity check** (BR 1.5 / 2.5): an item can require one. IT records how identity was
  confirmed (method and note) before work can start or automation can run. Requesters never see
  the note. The starter "Password reset" item requires it.
- **AI** (advisory only, on the existing AI layer, with its keys, credits, usage log and rate
  limit):
  - `service_request_intake`: a "Describe what you need" box on the portal suggests the catalog
    item and pre-fills its form. The person still reviews and submits.
  - `service_request_triage`: approvers and IT can ask for a summary, risk notes, missing
    information and a suggestion. It's stored on the request, labelled as AI, and has no write
    path to approvals.
- **Reporting** (AC 2.12): automation runs by outcome, auto-approved, fulfilled automatically,
  self-service, failed, and needing review now.
- **Permission:** `serviceautomation.manage` (rules and connectors), held by the Organisation
  administrator.
**Date:** 2026-10-16, revised 2026-10-17
**Inputs:** the three IT Service Request user stories (submission, approval and automated fulfilment,
approval and status tracking) and the ALVAO ITSM/ITAM brochure collected at a conference.

---

## 0. Product shape: a separate module on the shared platform

IT Requests is **not** a testing feature. It serves a different buyer (the IT manager), a
different audience (every employee) and a different question ("can I get what I need to do my
job?"). It is built as **its own module** that shares only the platform underneath.

| Shared with the rest of TestMate (built once) | Owned by IT Requests alone |
|---|---|
| Sign-in and the organisation | Its tables: `service_desk_settings`, `service_catalog_*`, `service_request*` |
| **Team**: one list of people per organisation | Its pages, under its own **IT requests** sidebar section |
| Roles and permissions (`modules/access`) | Its permissions: `servicerequest.create`, `servicedesk.work`, `servicedesk.manage` |
| Notifications and email | Its catalog setup page (inside the module, not in Settings) |
| Activity / audit log | |
| (later) AI keys and credits | |

**The one rule:** `modules/serviceDesk` imports only shared code (`shared/`, `infrastructure/`,
`modules/access`, `modules/activity`, `modules/notification`, `modules/auth` for users). It never
imports a testing module (projects, suites, cases, runs, bugs, feedback), and no testing module
imports it. That keeps it liftable into its own product later.

**On/off per organisation.** `service_desk_settings.enabled` (off by default). While it is off,
only people holding `servicedesk.manage` see the section, so they can set up the catalog before
launch. Everyone else's requests endpoints answer *"IT requests is not turned on"*. A matching
switch for the testing side is deferred: today every organisation keeps testing.

**Sidebar.** Two labelled groups, plus the shared bottom group:

```
TESTING          Dashboard · Projects · All tickets · …   (unchanged)
IT REQUESTS      Request something · My requests · Approvals (n) · IT queue · Catalog setup
───────────────  Team · Activity · Settings                (shared)
```

Someone who holds only the new **Employee** role sees just *IT requests* and lands on the request
portal after sign-in. They never see a project.

### Phase 1 as built

- Catalog: categories and items, seeded per organisation on first use with the 8 story categories
  and one starter item each. Dynamic forms (text, textarea, number, date, select, multi-select,
  checkbox).
- Requests: draft, submit, cancel, `SR-000123` references, *requested for* (a colleague, or a
  joiner with no account yet), priority, business justification.
- **Single-step approval:** an item either needs no approval, or names approvers (any one decides).
  If an item names nobody, it falls back to holders of `servicedesk.manage`. Requesters never
  approve their own requests.
- Manual fulfilment queue: assign, start, fulfil (with a note), cancel with a reason.
- Comments (public, plus internal notes for IT), full status history, notifications (in-app and
  email), and an audit entry for every decision.
- Built-in roles: **Employee** (submit only) and **IT service agent** (submit and work the queue).
  Every existing internal built-in role can submit, and Organisation administrator gets all three
  permissions.
- **Deleting from the catalog.** A category or item can be deleted only if nothing in it was ever
  requested, drafts included. Otherwise the server refuses and points to **Hide**, so request
  history stays intact. The check runs on locked rows. The starter catalog is seeded once per
  organisation (`service_desk_settings.catalog_seeded`), so deleting every category doesn't
  bring it back.
- **Phase 1b (built):** attachments on requests — images, PDF, Word and Excel, up to 10 files of
  10 MB each. Anyone involved can add files until the request is finished; people remove their
  own, and IT can remove any. A request submitted with files is saved as a draft first, so
  approvers never see it before its files arrive.

### Phase 2 as built (story 3)

- **Approval engine** (`domain/approvalPlan.ts`, pure and tested). An item's approval is one of:
  none; one step where any named person decides; or an **approval policy**. A policy is
  ordered steps that run one after another. Each step lists approver rules (a person, an
  **approver group**, or the **line manager**) and needs either *any one* of them, or *one from
  each line*. Within a step everyone is asked at once, and any rejection ends the request. The
  whole plan is written at submit (later steps are "waiting"), so the route a request started
  with is the route it finishes.
- **Authority.** Each approver group has a maximum risk level, and each catalog item a risk level
  that travels onto its requests. A group below a request's risk contributes nobody. Its members
  are also refused at decision time, and the authority level is recorded on the decision.
- **Who never approves:** the requester, or the person the request is for, including as a
  delegate. A rule that ends up with nobody falls back to `servicedesk.manage` holders. A step
  that still has nobody refuses the submission, so a request never skips approval by accident.
- **Line managers:** `users.manager_id`, set in *Catalog setup → Line managers*, with no reporting
  loops allowed. The rule means the manager of the person the request is for. For a new starter,
  it means the requester's manager.
- **Delegation:** each person sets their own stand-in and dates on the Approvals page. New
  approvals go straight to the stand-in. The stand-in can also decide approvals already waiting
  for the absent person, and the record shows who actually decided.
- **Waiting for information** (`info_requested`). An approver on a live step, or IT, asks the
  requester a question. The request pauses and returns to exactly where it was when they answer,
  and the paused time is added back to its due dates.
- **Service levels and escalation** (`domain/serviceLevels.ts`). Each approval step has hours per
  step, and fulfilment has hours by priority (from reaching IT to fulfilled); items may override
  both. Escalation has three levels: a reminder at the due time, then the escalation contacts at
  +50% and at +100% (critical), both percentages configurable. A sweeper runs on a five-minute
  timer and also whenever anyone's sidebar loads its counts. A Postgres advisory lock and the
  unique escalation row make it safe to run on several servers and to re-run.
- **Reporting** (`servicedesk.report`, held by Org admin and IT service agent):
  - Right now: open requests, pending and overdue approvals, ready for IT, overdue fulfilment,
    waiting on the requester.
  - For the period: submitted, fulfilled, on-time rate, average approval and fulfilment times,
    and escalations.
  - Breakdowns by category and by person, and the longest-overdue requests.
- **IT queue** gains *Overdue* and *Waiting on requester* tabs. Rows and the request page show an
  overdue badge with the escalation level.

---

## 1. What ALVAO is selling, and what is worth copying

ALVAO is an ITSM (service desk) and ITAM (asset management) product built on Microsoft 365. The
brochure's pitch is simple: **"one place for every request, so nothing depends on a spreadsheet or
someone's memory, and the answer is already there when an auditor asks."** The features behind that
pitch fall into four groups.

| ALVAO capability | What it really means | Business value | TestMate today |
|---|---|---|---|
| **Service catalog and self-service portal** | Employees pick from a tiled menu of services ("Request a laptop", "Access to Salesforce"), each with its own form. | Requests arrive complete and already categorised, so nobody has to triage them by hand. This is the single biggest saving. | ❌ Only one generic ticket form per project or client company. |
| **Smart workflows that categorise, prioritise and route** | Rules route each request to the right approver or team. | Removes manual routing. Requests stop sitting in the wrong queue. | 🟡 Client-company auto-assign exists (`company.autoassign`), but it is round-robin, not rule-based. |
| **Codeless workflow / approvals** | An admin configures approval chains with no code. | Policy is enforced by the system, not by people remembering it. | ❌ No approvals anywhere. |
| **SLA management** | Targets, breach flags, escalation. | Measurable service. | ✅ `modules/sla`: targets per severity, pause states, breach at query time. No escalation *action* yet. |
| **Audit trail / regulatory compliance (DORA, NIS2, Cyber Essentials)** | Every change, decision and automated action is logged and exportable. | Passes audits without a scramble. | ✅ `ActivityService` + CSV export (`activityExport.service.js`). |
| **AI agents** | Answers common questions directly. Helps agents enrich and prioritise tickets. | Fewer tickets reach a human, and the ones that do are faster. | 🟡 AI layer (`modules/ai`) with keys, credits and drafts for bugs and feature requests. |
| **AI knowledge base** | Writes articles from recurring tickets automatically. | Self-service deflects repeat requests. | ❌ |
| **Joiners, movers, leavers** | One HR event fans out into IT, Finance and Facilities tasks. | Onboarding and offboarding happen consistently and on time. | ❌ |
| **Asset management / CMDB / Autopilot** | Knows which devices and software exist, who has them, and their dependencies. Discovery via Intune and Entra ID. | Answers "what do we own and where is it". Up to 95% of asset updates automated. | ❌ A separate product line. Out of scope here (§11). |
| **Integrations** (Teams, Entra ID, Intune, Power Automate, Jira, REST API, MCP) | Meets users where they already work, and lets other tools do the provisioning. | Adoption, plus automation without building every connector. | 🟡 Partner integration API for client companies. No outbound webhooks. |

**The lesson for TestMate:** TestMate already has about 40% of an ITSM product: a ticket lifecycle,
a client-company IT support tier, SLA, notifications, audit and AI. What it lacks is the part that
turns *tickets* into *service requests*:

1. **a catalog** (structured, per-category forms),
2. **an approval engine** (policy-driven, sequential or parallel, with authority limits),
3. **a fulfilment engine** (manual tasks, plus automation through connectors),
4. **escalation that actually acts** (notifies and reassigns, rather than only flagging).

The user stories ask for exactly those four things. ALVAO's own pitch also shows how to deliver
them without building dozens of integrations: **let Power Automate, Logic Apps or a webhook do the
provisioning.** TestMate's job is to decide *whether* something may happen and to record *that* it
happened.

---

## 2. Reading the user stories

- **"DOMS"** appears in stories 1 and 3 ("submit IT service requests through DOMS", "integration
  with DOMS approval workflows"). Story 2 says "I want **TestMate** to configure…". This plan
  assumes DOMS is the customer's name for the platform, so the module is built inside TestMate.
  **Confirm this (Q1).**
- Story 2's "configure automation rules" and "AI-assisted workflow engine" are two different
  things. The business rules settle it: **AI recommends, rules decide** (BR 2.1: "AI
  recommendations shall not override mandatory approval requirements"). The design keeps a
  deterministic rules engine as the authority and treats AI as an advisor whose output is
  recorded but never acted on by itself.
- **Password resets** cannot be submitted by an authenticated user who has forgotten their
  password. In practice they are raised **on behalf of** someone (a manager or the service desk)
  or deflected to the identity provider's self-service reset. The design adds a *requested for*
  field and a *deflect* fulfilment type (§6.4).
- **New accounts** are requested for someone who has no account yet (a joiner), so *requested for*
  must also accept a person who is not a user yet (name and email only).

---

## 3. Design decisions (defaults applied, tell me to change any)

| # | Question | Default |
|---|---|---|
| D1 | Organisation-level or project-level? | **Organisation-level.** IT requests are about the employee, not a test project. This is the first major module that is not project-scoped, so it follows the *platform permission* model (`requirePermission`), not `requireProjectAccess`. |
| D2 | Who are the requesters? | **The organisation's own users** (authenticated, BR 1.1). A new built-in **Employee** role holds only `servicerequest.create`. Client-company end users keep the existing ticket form. Extending the catalog to them is Phase 4. |
| D3 | Approver resolution | Approval steps resolve approvers by **rule**, not by name: `line_manager`, `catalog_owner`, `approver_group:<id>`, `user:<id>`. `line_manager` needs a new `users.manager_id` (none exists today). |
| D4 | Approval authority ("not beyond their assigned authority", story 3 BR 2) | **Approver groups carry a maximum risk level** (`low`, `medium`, `high`, `critical`). A step for a *high* risk request can only be decided by a group whose limit is *high* or above. Enforced in the service and recorded on the decision. |
| D5 | Auto-approval | Off by default. Only possible on a catalog item whose admin has ticked **auto-approve**, *and* whose rule conditions pass, *and* whose risk level is `low`. Never for items marked **privileged**. The rule is checked at decision time, not configuration time. |
| D6 | Automated fulfilment | A **connector** interface. v1 ships `manual` (a task for a person), `webhook` (signed HTTP POST to Power Automate, Logic Apps, n8n and similar, with a callback URL to report the result) and `deflect` (send the requester to a self-service link). Native Entra ID or Intune connectors come in Phase 4. |
| D7 | Escalation timer | TestMate has **no job runner** (SLA breach is computed at query time). Escalation must *act*, so add one in-process **sweeper** (`setInterval`, every 5 min) guarded by a Postgres advisory lock so that only one instance runs it. It is idempotent: each escalation level is recorded once. |
| D8 | Reference numbers | `SR-000123` from a dedicated sequence, so the existing ticket numbers are untouched. |
| D9 | Configurable form fields | A **JSON field schema** per catalog item (text, textarea, select, multi-select, date, user-picker, number, checkbox, attachment), validated on the server by building a Zod schema from it. No form-builder library. |
| D10 | AI | Two features on the existing AI layer: `service_request_intake` (turns free text into a suggested catalog item, priority and missing fields) and `service_request_triage` (a risk and routing *recommendation* shown to approvers). Both are advisory. |

---

## 4. Domain model

### 4.1 Tables

```
service_catalog_categories     id, organization_id, key (software_access|hardware|new_account|
                               password_reset|business_application|cloud_resource|access_card|
                               it_solution|custom), name, icon, sort_order, is_active

service_catalog_items          id, organization_id, category_id, name, description, icon,
                               form_schema jsonb,              -- D9
                               risk_level (low|medium|high|critical),
                               is_privileged bool,             -- privileged access, admin rights
                               approval_policy_id,             -- null = no approval needed
                               fulfilment_type (manual|webhook|deflect),
                               fulfilment_config jsonb,        -- connector settings, never secrets
                               fulfilment_team_id,             -- who works the manual task
                               auto_approve bool, auto_approve_conditions jsonb,
                               sla_target jsonb,               -- approval and fulfilment hours
                               owner_id, is_active, version

approval_policies              id, organization_id, name,
                               steps jsonb  -- [{ order, mode: all|any, approvers: [rule...] }]
                                            -- same order = parallel, next order = sequential

approver_groups                id, organization_id, name, max_risk_level
approver_group_members         group_id, user_id
service_teams                  id, organization_id, name     -- fulfilment teams
service_team_members           team_id, user_id

service_requests               id, organization_id, reference (SR-000123),
                               catalog_item_id, catalog_item_version,
                               requester_id, requested_for_id null,
                               requested_for_name/email null,  -- a joiner with no account
                               title, description, business_justification,
                               priority (low|medium|high|critical), risk_level,
                               form_values jsonb, status, status_updated_at,
                               assigned_team_id, assignee_id,
                               submitted_at, approved_at, fulfilled_at, closed_at,
                               approval_due_at, fulfilment_due_at, escalation_level int,
                               created_at, deleted_at

service_request_approvals      id, request_id, step_order, approver_rule, approver_id,
                               group_id null, decision (pending|approved|rejected|skipped),
                               decided_by_id, decided_at, comment, authority_level,
                               decided_by_automation bool

service_request_status_history id, request_id, from_status, to_status, actor_id null,
                               automation_run_id null, note, created_at

service_request_comments       id, request_id, author_id, body, is_internal bool, created_at
service_request_attachments    (same shape as bug_attachments, Cloudinary)

service_automation_rules       id, organization_id, name, priority, is_active,
                               conditions jsonb,  -- category, item, risk, requester role, field values
                               actions jsonb      -- set_priority, route_team, require_policy,
                                                  -- flag_for_review, auto_approve (if item allows)

service_automation_runs        id, request_id, rule_id null, connector, trigger,
                               status (succeeded|failed|retrying|skipped), attempt,
                               input_summary jsonb, result jsonb, error, initiated_by_id null,
                               system_identity, started_at, finished_at

service_webhook_endpoints      id, organization_id, name, url, secret_sealed (secretBox),
                               is_active, last_success_at, last_failure_at
```

The existing infrastructure is reused, not copied: `secretBox.ts` (from the AI work) seals
webhook secrets, `ActivityService.buildEntry` runs inside each decision transaction, and
`NotificationService` gains `notifyServiceRequest*` methods.

**Why a catalog item version is snapshotted on the request.** An admin will edit forms and
policies while requests are in flight. The request must keep being judged by the rules it was
submitted under, and an auditor must be able to see which rules those were.

### 4.2 Lifecycle

```
Draft ──submit──▶ Submitted ──rules──▶ Pending Approval ──all steps approved──▶ Approved
  │                  │                     │                                       │
  └──cancel──▶ Cancelled ◀──cancel─────────┤── any step rejected ──▶ Rejected      │
                                           └── needs info ──▶ Info Requested ─┐    │
                                                 (requester replies) ◀────────┘    │
Submitted ──no approval policy──────────────────────────────────────────────▶ Approved
Approved ──fulfilment starts──▶ In Progress ──done──▶ Fulfilled ──(7 days)──▶ Closed
                                    └── connector failed ──▶ In Progress (escalated to team)
```

The statuses come from the story (Draft, Submitted, Pending Approval, Approved, Rejected, In
Progress, Fulfilled, Cancelled). **Info Requested** and **Closed** are additions: AC 2.6 needs a
"requires additional information" state, and Closed lets SLA pause and stop counting. Transitions
live in one `assertValidRequestTransition`, the same pattern as `assertValidSupportTransition`.

**The hard invariant (BR 1.2 and 2.4):** nothing reaches *In Progress* while any approval row is
`pending` or `rejected`. This is checked in the service at the moment of transition, inside the
same transaction, not just by the UI or the workflow.

---

## 5. Routing and approval engine

On **submit** the service runs one deterministic pipeline and records every step:

1. **Validate** `form_values` against the item's snapshotted `form_schema`.
2. **Evaluate automation rules** in priority order. They can raise the priority, route to a team,
   require a stricter approval policy, or flag the request for manual review. A rule can **never**
   remove a policy the catalog item requires, or lower the risk level (BR 2.1, 2.3).
3. **Build approval rows** from the policy. Each `approver_rule` is resolved to concrete people
   *now* (line manager, group members). If a rule resolves to nobody (no manager on record), the
   request is flagged **needs routing** and sent to the service desk instead of being stuck.
4. **Auto-approve check** (D5). If it passes, rows are marked `approved` with
   `decided_by_automation = true` and the rule id. Otherwise they stay pending.
5. **Separation of duties:** a requester is never resolved as their own approver. If they would be,
   the step falls to the next person in the group or escalates.

**Deciding** (story 3): `POST /service-requests/:id/approvals/:approvalId/decision` with
`{ decision, comment }`. The service checks that the actor is the resolved approver (or a member
of the group), that the group's `max_risk_level` covers the request (D4), and that the step is
the current one in sequence. A rejection requires a comment and is final; the record and reason
are kept (story 3, BR 4). **Delegation:** a user can set an out-of-office delegate with a date
range, and approvals resolve to the delegate during that window (story 2, tech note 3).

---

## 6. Fulfilment and automation

### 6.1 The connector interface

```ts
interface FulfilmentConnector {
  type: "manual" | "webhook" | "deflect";
  preflight(req, ctx): Promise<PreflightResult>; // approvals done? identity verified? config valid?
  execute(req, ctx): Promise<ExecutionResult>;   // succeeded | accepted (async) | failed
}
```

`preflight` is where AC 2.7 lives: it refuses to run unless approvals are complete, any required
identity verification is recorded, and the item is active. A refusal is logged as a `skipped`
automation run with the reason.

### 6.2 Webhook connector (the high-leverage one)

When a request is approved, TestMate POSTs a signed payload (HMAC-SHA256 header, timestamp,
idempotency key = the run id) to the configured endpoint. The payload holds the request, the form
values and a one-time **callback URL**. Power Automate or Logic Apps does the real provisioning:
it adds the user to an Entra ID group, assigns a licence, or creates a cloud resource. It then
calls back with `succeeded` or `failed` and details.

- Retries 3 times with backoff on 5xx or timeout. After that, the run is `failed`, the request
  goes to the fulfilment team as a manual task, and the team lead is notified (AC 2.11).
- Every attempt is a row in `service_automation_runs` (AC 2.9). The system identity is recorded
  as `automation:<rule or connector id>`, and the initiating user as `initiated_by_id` (BR 2.6).
- **No credentials for the target systems are ever stored in TestMate.** They stay in the
  customer's Power Automate tenant. TestMate holds only the webhook signing secret, sealed with
  `secretBox`. This is least privilege (tech note 2.5), and it is also why D6 defers native
  connectors.

### 6.3 Manual fulfilment

A task on the fulfilment team's queue: assign, add progress notes, record fulfilment details,
mark fulfilled (story 3, AC 6). It reuses the queue UI patterns from the client-company support
queue.

### 6.4 Password resets and identity verification (BR 1.5, 2.5)

Two configurations, chosen per organisation on the *password reset* catalog item:

- **Deflect (recommended):** the item shows the identity provider's self-service reset link
  (Entra SSPR, Google, Okta). Nothing is sent to TestMate, and the request is recorded as
  *fulfilled by deflection* for reporting.
- **Assisted:** the service desk agent must complete a **verification checklist** before fulfilment
  can start (method used, for example a manager call-back or ID check, plus who verified it and
  when). `preflight` refuses without it. **TestMate never stores or transmits the new password.**
  The agent resets it in the identity provider and marks the request fulfilled.

---

## 7. Escalation and overdue (story 3, AC 7 and 8)

- `approval_due_at` and `fulfilment_due_at` are set from the item's `sla_target` when the request
  enters each phase. SLA pause states (`Info Requested`) extend them.
- The sweeper (D7) finds overdue requests and steps `escalation_level`:
  - **Level 1:** remind the approver or assignee.
  - **Level 2:** notify the group or team lead.
  - **Level 3:** notify the configured escalation contact and flag the request red on the dashboard.

  Each level is logged once, so re-runs are safe.
- The SLA dashboard gains a *Service requests* source next to tickets, bugs and feature requests,
  reusing `SlaService` breach logic (`sla_source_targets` already exists).

---

## 8. Access model additions

> **As built in Phase 1:** three permissions in a new `servicedesk` category,
> `servicerequest.create`, `servicedesk.work` and `servicedesk.manage` (catalog, approvers and the
> on/off switch), plus the **Employee** and **IT service agent** built-in roles. The finer split
> below (`servicedesk.assign`, `serviceautomation.manage`, `servicerequest.report`) arrives with
> the phases that need it, because the role matrix spec fails on any permission that no route
> enforces.

Following `docs/access-model.md`: permissions say *what kind of thing*, scoping says *which rows*,
and approver authority is a third check (D4) because it is about the request's risk, not the actor's role.

| Code | Label | Who holds it by default |
|---|---|---|
| `servicerequest.create` | Submit IT requests | Every built-in role, plus the new **Employee** role |
| `servicedesk.read` | View the service desk queue | Service desk agent (new custom-role template), Org admin |
| `servicedesk.work` | Fulfil requests | Service desk agent |
| `servicedesk.assign` | Route and reassign requests | Service desk lead, Org admin |
| `servicecatalog.manage` ⚠ | Manage catalog, policies and teams | Org admin |
| `serviceautomation.manage` ⚠ | Manage automation rules and webhooks | Org admin. **Warning: can make requests self-approve.** |
| `servicerequest.report` | Service request reports | Org admin, Test lead |

**Approving is not a permission.** You may approve a request because the policy resolved you as
its approver and your group's authority covers its risk, not because your role says "approver".
This matches principle 1 ("no code branches on a role name").

**Row scoping:** requesters see requests they raised or that were raised for them. Approvers see
requests with a row resolved to them. Agents see their teams' queues. `servicedesk.read` without
a team sees everything in the organisation. Every query is filtered by `organization_id` first.

New permissions must be granted to existing roles **by a migration**, because the seed never adds
to existing roles (precedent: `AddAiPermissions`).

---

## 9. Where AI fits (and where it must not)

| Feature | What it does | Guardrail |
|---|---|---|
| `service_request_intake` | "Describe what you need" box on the portal. Suggests the catalog item, pre-fills fields, asks for anything missing. | The user confirms the item and submits the normal form, so AI never submits. |
| `service_request_triage` | Shown to the approver: risk summary, similar past requests and how they were decided, and anything missing from the justification. | Display only. Logged as a recommendation on the request. Has no write path to approvals. |
| *Later:* `knowledge_article_draft` | Drafts a knowledge-base article from a cluster of similar fulfilled requests (ALVAO's AI knowledge base). | A person publishes. |

These use the existing `modules/ai` plumbing: keys, credits, usage log, rate limiter and the
`AI_FEATURES` tuple. AC 2.1 ("analyse submitted requests against… contextual information") is met
by the **rules engine**. AI adds context, but the system's decision never depends on it.

---

## 10. Client UI

| Page | Who | Content |
|---|---|---|
| **IT Requests portal** `/requests` | Everyone with `servicerequest.create` | ALVAO-style tile grid of categories, then items, search, and the AI intake box. Item page renders the dynamic form, justification, priority, attachments and *requested for*. Save as draft or submit. |
| **My requests** | Requester | Reference, status, a stepper for approval progress (who, when, comment), fulfilment notes and history (AC 1.9). Cancel while not yet in progress. |
| **Approvals inbox** | Anyone with pending approvals | Badge count in the sidebar. Detail view with justification, attachments, previous decisions and AI triage. Approve, reject, or request info. Bulk approve only for low-risk items. |
| **Service desk queue** | `servicedesk.*` | Filters by team, status, overdue and failed automation. Assign, work and fulfil. Failed automations are pinned to the top. |
| **Settings → Service catalog** | `servicecatalog.manage` | Categories, items (form builder with live preview), approval policies, approver groups, teams, SLA targets. |
| **Settings → Automation** | `serviceautomation.manage` | Rules (condition and action builder, with a dry-run against the last 50 requests), webhook endpoints (test button), run log. |
| **Reports** | `servicerequest.report` | Volume by category, approval time, fulfilment time, SLA attainment, automation success and failure rate, requests needing manual intervention (AC 2.12, story 2 tech note 7). |

---

## 11. Phasing

| Phase | Ships | Stories and criteria covered |
|---|---|---|
| **1. Catalog and requests** | Catalog (seeded with the 8 categories), dynamic forms, submit, draft, cancel, SR references, my requests, manual fulfilment queue, notifications, audit, Employee role | Story 1 entirely, assuming single-step approval |
| **2. Approval engine** | Policies, sequential and parallel steps, approver groups with authority, line manager (`users.manager_id`), delegation, approvals inbox, request info, sweeper and escalation, SLA source | Story 3 entirely |
| **3. Automation** | Rules engine and dry-run, auto-approve, webhook connector with callback and retries, deflect, identity-verification checklist, run log, automation reports, AI intake and triage | Story 2 entirely |
| **4. Beyond the stories (ALVAO parity, pick by demand)** | Microsoft Teams bot (submit and approve in Teams), native Entra ID connector, joiner/mover/leaver bundles (one request fans out into several items), knowledge base, catalog for client-company end users, **an MCP server** so customers' own AI agents can query and raise requests | Brochure features |

**Deliberately not planned:** a full asset management system or CMDB (discovery, Intune sync,
dependency graph). It is a separate product. If wanted, start with a minimal **asset register**
linked to requests (a hardware request fulfilled creates an asset assigned to the person), which
covers the *where is it, who has it* question auditors ask without building discovery.

---

## 12. Acceptance-criteria traceability

| Story, AC | Met by |
|---|---|
| 1.1 create, view, track | §10 portal and my requests, §8 scoping |
| 1.2 eight categories | §4.1 `service_catalog_categories` seed |
| 1.3 category-relevant fields | D9 `form_schema` |
| 1.4 description, justification, priority, attachments | `service_requests` columns, attachments table |
| 1.5 unique reference | D8 |
| 1.6 statuses | §4.2 |
| 1.7 routing by rules | §5 |
| 1.8 notifications | `NotificationService.notifyServiceRequest*` on every transition |
| 1.9 history and approval progress | status history and approval rows, stepper UI |
| 1.10 audit | `ActivityService.buildEntry` in-transaction, plus status history |
| 2.1–2.3 analyse, identify routine, route | §5 rules engine |
| 2.4 auto-approve only where authorised | D5 |
| 2.5 automated fulfilment | §6 connectors |
| 2.6 flag for info or review | `Info Requested` state, `flag_for_review` action |
| 2.7 block unsafe automation | `preflight`, §4.2 invariant |
| 2.8 notifications | as 1.8 |
| 2.9 record automation | `service_automation_runs` |
| 2.10 review and intervene | run log, override to manual |
| 2.11 escalate failures | §6.2 retry, then manual task |
| 2.12 reports | §10 Reports |
| 3.1–3.3 approval queue, details, decide | §5, approvals inbox |
| 3.4 route after approval | fulfilment start on approval |
| 3.5 notify decisions | as 1.8 |
| 3.6 progress updates | §6.3 |
| 3.7–3.8 overdue and escalation | §7 |
| 3.9 audit | as 1.10 |

---

## 13. Open questions (answers change the build)

1. **Q1. What is DOMS?** Is it the customer's name for TestMate (the assumption here), or a separate
   system TestMate must integrate with for approvals and notifications?
2. **Q2. Requesters:** only the organisation's own staff (D2), or also client-company end users from day one?
3. **Q3. Identity provider:** does the target customer use Entra ID? If so, a native Entra connector
   (Phase 4) may be worth promoting, and SSPR deflection for passwords is a given.
4. **Q4. Line managers:** is there an HR source for `manager_id`, or will admins maintain it in
   Team settings?
5. **Q5. Hosting:** is the server a single instance on Render? D7's sweeper is safe either way
   thanks to the advisory lock, but a single instance keeps it simple.
