# IT Requests: user stories and test guide

**Covers:** Phase 1 (catalog and requests), Phase 1b (attachments), Phase 2 (approval engine,
information requests, service levels, escalation, reports) and Phase 3 (automation rules,
automatic approval, connectors, identity checks, self-service and AI). Phase 3 is in section 9b.
**Design reference:** [it-service-requests-plan.md](it-service-requests-plan.md)

Each story has the **user story**, then **checks** to tick as you test. ✅ checks are things that
should work. 🚫 checks are things that must be refused. Tick a box when the result matches.

---

## 0. Before you start

### 0.1 Run the migrations and tests

```bash
cd server && npm run migration:run
```

```bash
cd server && npx jest modules/serviceDesk shared/access/tests/roleMatrix.spec.js
```

- [ ] All four migrations ran: `1783530000000-AddServiceDesk`, `1783540000000-AddServiceDeskApprovalsAndAttachments`, `1783550000000-AddServiceCatalogSeededFlag` and `1783560000000-AddServiceDeskAutomation`
- [ ] `serviceDeskAutomation.spec.ts` passes
- [ ] `AI_KEYS_SECRET` is set on the server. Connectors can't be added without it, and AI features need an AI key under Settings → AI
- [ ] `serviceDesk.spec.ts` passes
- [ ] `roleMatrix.spec.js` passes
- [ ] The full `npm test` passes

### 0.2 Test accounts

Create these in **Team**, all in the same organisation, and give each the role shown. These short
names are used throughout the guide.

| Name in this guide | Role to assign | Used for |
|---|---|---|
| **Admin** | Organisation administrator | Setup, fallback approver, reports |
| **Agent** | IT service agent | IT queue, fulfilment, reports |
| **Agent 2** | IT service agent | Reassigning between agents |
| **Setup-only** | A custom role with only *Set up IT requests* | Confirms automation needs its own permission (US-40) |
| **Emma** (employee) | Employee | Requester who sees nothing of testing |
| **Ben** (employee) | Employee | Colleague: "requested for", stand-in |
| **Mary** (manager) | Employee | Emma's line manager; approver |
| **Fin** (finance) | Employee | Member of the Finance approver group |
| **Tess** (tester) | Tester or QA engineer | Confirms testing users can also request |
| **Sam** (supporter) | Support lead (client company) | Must see nothing of IT requests |

> **Tip:** use a separate browser profile, or a private window, per account so you can switch quickly.

### 0.3 What each role should see

| Role | Sidebar "IT requests" items |
|---|---|
| Employee | Request something · My requests · Approvals |
| IT service agent | Request something · My requests · Approvals · IT queue · Reports |
| Organisation administrator | All of the above + Catalog setup |
| Tester / QA engineer / Test lead | Request something · My requests · Approvals (plus their normal Testing items) |
| Support lead (client company) | No "IT requests" group at all |

---

## 1. Turning the module on

### US-01 Turn IT requests on and off
**As an** organisation administrator, **I want to** turn IT requests on or off for my organisation,
**so that** I can prepare the catalog before employees see it.

- [ ] ✅ Before it's turned on, Admin sees an **IT requests** sidebar group containing only **Catalog setup**
- [ ] ✅ Before it's turned on, Emma sees no IT requests items. If she opens `/requests` directly, she sees *"IT requests isn't turned on yet"*
- [ ] ✅ Admin opens Catalog setup, clicks **Turn on** and confirms. The banner turns green: *"IT requests is on"*
- [ ] ✅ After a refresh, Emma sees **Request something**, **My requests** and **Approvals**
- [ ] ✅ **Turn off**, then confirm: employees lose the section, and nothing is deleted (turn it back on and old requests are still there)
- [ ] ✅ **Activity** has an entry "Turned on IT requests" / "Turned off IT requests", at warning level

### US-02 Separate sidebar sections
**As any** user, **I want** IT requests in its own sidebar section, **so that** it doesn't mix with testing.

- [ ] ✅ Admin and Tess see three labelled groups: **Testing**, **IT requests**, **Workspace** (Team and similar items are in Workspace)
- [ ] ✅ Emma sees only **IT requests** (plus Settings at the bottom) and never sees Projects or Dashboard
- [ ] ✅ When Emma signs in, she lands on **Request something** (`/requests`), not the dashboard
- [ ] ✅ Sam sees no IT requests group. Opening `/requests` sends him back to his own home page
- [ ] ✅ Badges: **Approvals** shows a count when something is waiting for you, and **IT queue** shows the number ready for IT

### US-03 Starter catalog
**As an** administrator, **I want** a ready-made catalog, **so that** I don't start from nothing.

- [ ] ✅ The first time anyone opens Catalog setup (or the portal), these 8 categories exist: Software access, Hardware, New accounts, Password resets, Business applications, Cloud resources, Access cards, IT solutions
- [ ] ✅ Each category has one starter item with its own form
- [ ] ✅ "Password reset or account unlock" and "Something else" need **no approval**. "Cloud resource" is **high risk**. The other items need approval.

---

## 2. Setting up the catalog (administrator)

### US-04 Manage categories
**As an** administrator, **I want to** add, edit, hide and delete categories, **so that** the portal matches how my organisation thinks.

- [ ] ✅ **Add category** with a name, description and icon. It appears as a tile on the portal (once it has an active item)
- [ ] ✅ **Edit** changes the name, description or icon
- [ ] ✅ **Hide** marks it "Hidden" and removes it from the portal. **Show** brings it back
- [ ] ✅ An item in a hidden category can't be requested, and an existing draft for it says *"That item is no longer in the catalog"* when submitted
- [ ] ✅ **Delete** (bin icon) asks for confirmation, warning that its items are deleted too
- [ ] ✅ A category whose items were **never** requested (not even as a draft) is deleted, along with its items. Activity logs "Deleted the IT-request category …" (warning)
- [ ] 🚫 A category where any item was ever requested is refused: *"N requests were raised for items in "…". Hide the category instead…"*. Nothing is deleted
- [ ] ✅ **Starter catalog doesn't come back:** delete every unused category, then reload Catalog setup and the portal. The eight starter categories are **not** re-created

### US-05 Manage catalog items and their forms
**As an** administrator, **I want to** define what people can request and the questions each asks,
**so that** requests arrive complete.

- [ ] ✅ **+ Item** opens the editor with a name, category and description
- [ ] ✅ **Form builder:** add questions of each type: Short text, Long text, Number, Date, Pick one, Pick several, Tick box
- [ ] ✅ The answer key auto-fills from the question text, and can be edited by hand
- [ ] ✅ Questions can be moved up or down and removed
- [ ] ✅ **Preview** shows the form exactly as requesters will see it
- [ ] 🚫 Saving with a choice question that has no options shows *"Field N needs at least one option"*
- [ ] 🚫 Two questions with the same key are refused
- [ ] ✅ **How IT fulfils this (IT only)** notes save, and later appear only to IT on the request page (US-32)
- [ ] ✅ **Show on the request portal** unticked hides the item. The Hide/Show buttons on the list do the same
- [ ] ✅ **Activity** logs "Added … to the IT-request catalog" and "Updated …"
- [ ] ✅ **Delete** (bin icon) on an item **nobody ever requested**: after confirming, it's gone. Activity logs "Deleted … from the IT-request catalog" (warning)
- [ ] 🚫 **Delete** on an item with any request, **including a draft**, is refused: *"N requests were raised for "…". Hide it instead, so their history stays intact."* The item is still there
- [ ] ✅ After hiding (not deleting) a used item, its old requests still open normally and show the item's name and answers

### US-06 Choose how an item is approved
**As an** administrator, **I want to** choose how each item is approved, **so that** policy is enforced by the system.

- [ ] ✅ **No approval:** submitted requests go straight to the IT queue
- [ ] ✅ **One step, any of these people:** pick approvers from a searchable list. Any one of them decides
- [ ] ✅ **An approval policy:** pick a policy (US-21). The list line shows *follows "Policy name"*
- [ ] 🚫 Choosing "An approval policy" without picking one: *"Pick the approval policy this item follows"*
- [ ] ✅ **Risk:** Low / Medium / High / Critical. Non-low risk shows on the catalog list line
- [ ] ✅ Changing approvers, approval mode, policy or risk creates a separate warning-level Activity entry, *"Changed who approves …"*

---

## 3. Requesting something (employee)

### US-07 Browse and search the portal
**As an** employee, **I want to** find what I need quickly, **so that** I can ask IT without knowing their jargon.

- [ ] ✅ **Request something** shows category tiles
- [ ] ✅ A category with one item goes straight to that item's form. One with several shows a list of items
- [ ] ✅ Search (for example "laptop" or "adobe") finds items across all categories
- [ ] ✅ Items that need approval show a **Needs approval** badge

### US-08 Fill in the request form
**As an** employee, **I want** a form that asks only what this item needs, **so that** IT doesn't come back with questions.

- [ ] ✅ The title defaults to the item name and can be edited
- [ ] ✅ The item's own questions appear, with required ones marked *
- [ ] ✅ "Anything else IT should know?", **Business justification** and **Priority** (Low/Medium/High/Critical) are always present
- [ ] 🚫 **Submit** with a required answer missing shows every problem at once, each under its field
- [ ] ✅ A notice reads *"This needs approval before IT can start"* when it does

### US-09 Request on someone else's behalf
**As an** employee, **I want to** request for a colleague or a new starter, **so that** managers can set people up.

- [ ] ✅ **Who is this for?** has three choices: Me / A colleague / A new starter
- [ ] ✅ **A colleague:** search by name or email. You don't appear in the results
- [ ] ✅ **A new starter:** name (required) and email (optional), for someone with no account yet
- [ ] 🚫 "A colleague" chosen with nobody picked, or "A new starter" with no name, is refused
- [ ] ✅ The request page shows "For: Ben" or "For: Jo Bloggs (new starter)"
- [ ] ✅ Ben (the colleague) sees the request in **his** My requests once it's submitted, and can comment and answer questions on it

### US-10 Drafts
**As an** employee, **I want to** save a draft, **so that** I can finish it later.

- [ ] ✅ **Save draft** works even with required answers missing, and it gets a reference such as `SR-000012`
- [ ] 🚫 A wrong-type answer is refused even in a draft (for example letters in a Number question)
- [ ] ✅ It appears under **My requests → Drafts**
- [ ] ✅ The request page shows **Continue editing** and **Submit**
- [ ] ✅ **Discard draft** cancels it
- [ ] 🚫 Nobody else sees the draft: not Agent, not Admin, not the "requested for" colleague. They get *"doesn't exist, or you can't see it"*

### US-11 Submit
**As an** employee, **I want to** submit my request, **so that** it goes to the right people.

- [ ] ✅ An item with **no approval** shows as **Submitted** and appears in IT queue → **Ready**. Agents are notified
- [ ] ✅ An item **with approval** shows as **Pending approval**, and its approvers are notified (in the app and by email)
- [ ] ✅ The reference is shown in the success message and everywhere afterwards
- [ ] ✅ The history shows the submission with who and when
- [ ] ✅ Activity: "Submitted IT request SR-… "

### US-12 Attach files
**As an** employee, **I want to** attach screenshots or documents, **so that** IT and approvers have the evidence.

- [ ] ✅ On the form, **Attach files** accepts images (PNG/JPEG/WebP), PDF, Word and Excel
- [ ] 🚫 A file over 10 MB is refused with its name shown. More than 10 files per request is refused
- [ ] ✅ **Submit with files:** the request is saved as a draft, the files upload, *then* it is submitted. Approvers see the files when they open it
- [ ] ✅ The request page has a **Files** card: images show thumbnails, documents show an icon, and clicking opens the file
- [ ] ✅ **Add files** works on the request page while it's open, for the requester, approvers and IT
- [ ] ✅ You can remove your own files while the request is open. IT can remove anyone's
- [ ] 🚫 No files can be added once the request is Fulfilled, Rejected or Cancelled
- [ ] 🚫 Emma can't remove a file Agent added

### US-13 Follow my requests
**As an** employee, **I want to** see the state of everything I've asked for, **so that** I don't need to chase IT.

- [ ] ✅ **My requests** has tabs: **In progress**, **Drafts**, **Closed**
- [ ] ✅ Each row shows the reference, title, item, status, and "for X" when it applies
- [ ] ✅ The request page shows the status, priority, details, answers, files, approval steps, conversation and history
- [ ] ✅ The **Next step** card says what's happening ("Waiting for approval — Manager", "With IT", …)

### US-14 Cancel my request
**As an** employee, **I want to** withdraw a request I no longer need, **so that** nobody wastes time on it.

- [ ] ✅ Allowed while the request is Draft, Submitted, Pending approval, Approved or Waiting for information. The reason is optional
- [ ] ✅ Approvers' pending decisions become "Not needed". The assignee (if any) is told it was withdrawn
- [ ] 🚫 Once IT has **started** (In progress), cancelling says *"IT has already started on this request — add a comment to ask them to stop"*

---

## 4. Approving (single step)

### US-15 Approve or reject
**As an** approver, **I want to** approve or reject requests assigned to me, **so that** policy is followed.

- [ ] ✅ The approver gets a notification and email, *"Approval needed: SR-… "*, which opens the request
- [ ] ✅ The request page shows a yellow **Your approval is needed** box
- [ ] ✅ **Approve** works with or without a comment. The requester is told *"Your IT request was approved"*, and agents get *"New IT request"*
- [ ] 🚫 **Reject** without a comment: *"Say why you're rejecting it"*
- [ ] ✅ **Reject** with a comment: the requester is told, with the reason. Status **Rejected** is final, and the record and reason are kept
- [ ] ✅ With several approvers on a one-step item, the first decision wins and the others show **Not needed**
- [ ] 🚫 A second approver opening it afterwards sees no decision box. A direct attempt gets *"already approved/rejected"*

### US-16 Approvals inbox
**As an** approver, **I want** one place for everything waiting on me, **so that** nothing gets stuck.

- [ ] ✅ **Approvals → Waiting for me** lists requests with a pending decision for you (or for someone you're standing in for)
- [ ] ✅ **Decided** lists the ones you approved or rejected
- [ ] ✅ The sidebar **Approvals** badge matches the "Waiting for me" count

### US-17 Fallback and never self-approval
**As the** organisation, **I want** approval never skipped or self-granted, **so that** authorisation is real.

- [ ] ✅ An item set to "One step" with **nobody named**: the approval goes to IT request administrators (Admin). The step lists them as "stand-in approver"
- [ ] ✅ An item whose only named approver is Emma, when Emma requests it, falls back to Admin
- [ ] ✅ Approvals are also excluded for the "requested for" person: Emma requesting for Mary never asks Mary
- [ ] 🚫 If there is no administrator other than the requester, the submission is refused: *"Nobody can approve … yet. Ask an administrator to name approvers…"* The request stays as a draft

---

## 5. Approval engine (Phase 2)

Set up first (as Admin, in **Catalog setup**):
- **Line managers** tab: set **Mary** as Emma's manager
- **Approver groups** tab: create **Finance**, authority *up to Medium*, member **Fin**
- **Approval policies** tab: create **Manager then Finance**, with step 1 "Line manager" (any) and step 2 "Finance" group (any)
- Point the **Request hardware** item (medium risk) at that policy

### US-18 Line managers
**As an** administrator, **I want to** record who reports to whom, **so that** "line manager" approval steps go to the right person.

- [ ] ✅ The **Line managers** tab lists everyone, with a manager drop-down each. Saving shows "Line manager saved"
- [ ] ✅ The header says how many people have no manager
- [ ] 🚫 Someone can't be their own manager
- [ ] 🚫 No loops: if Mary manages Emma, setting Emma as Mary's manager is refused (*"… already reports to …"*)
- [ ] ✅ Activity: "Set Emma's line manager to Mary" (warning)

### US-19 Approver groups and authority
**As an** administrator, **I want** groups with an approval limit, **so that** nobody approves beyond their authority.

- [ ] ✅ Create, edit and delete groups (name, description, "May approve up to", members)
- [ ] 🚫 A group used by a policy can't be deleted: *"This group is used by …"*
- [ ] ✅ **Authority at submit:** point a **high**-risk item (Cloud resource) at a policy whose step is "Finance" (up to Medium). Finance gets no say, and the step goes to Admin as stand-in approver
- [ ] ✅ **Authority at decision:** submit a medium-risk request so Fin is asked. Lower Finance to *Low*, then Fin tries to approve: refused with *"This is a medium-risk request, beyond the authority of Finance (up to low)"*
- [ ] ✅ The approval record keeps the authority level used (visible in Activity metadata)

### US-20 Multi-step approval policies
**As an** administrator, **I want** approvals in several steps, **so that** requests follow our sign-off chain.

- [ ] ✅ The policy editor: add, rename, reorder and remove steps. Each step has **Any one of them** / **One from each line**
- [ ] ✅ Add approvers to a step: the requester's line manager, a group, or a person. Remove them with ×
- [ ] 🚫 A step with no approvers can't be saved. A policy used by items can't be deleted
- [ ] ✅ The policy card shows its steps and how many items use it
- [ ] ✅ **Sequential:** Emma requests hardware. Only **Mary** is asked first, and the **Approval** card shows step 2 as "Not started"
- [ ] ✅ When Mary approves, step 2 becomes live, **Fin** is notified, and the history notes *"Manager approved. Now with Finance."*
- [ ] ✅ When Fin approves, the request is **Approved**, the requester is told it got final approval, and it's in the IT queue
- [ ] ✅ A rejection at any step rejects the whole request, and the remaining steps show "Not needed"
- [ ] 🚫 Fin can't decide while step 1 is still with Mary: *"Your step hasn't started yet"*

### US-21 "Any one" vs "one from each line"
- [ ] ✅ Make a step "**One from each line**" with Finance + a person (e.g. Agent). Approval by Fin alone keeps the step live; it completes only when Agent also approves
- [ ] ✅ In that step, a second Finance member's pending row becomes "Not needed" once Fin approves (that line is satisfied)
- [ ] ✅ In an "**Any one**" step, the first approval completes the step and all other rows become "Not needed"
- [ ] ✅ In an "all" step, a line with nobody to staff it (e.g. line manager not set) is filled by Admin as stand-in. The other lines remain

### US-22 Line manager rule edge cases
- [ ] ✅ The requester has no manager: the line-manager step goes to Admin as stand-in approver
- [ ] ✅ Emma requests **for Ben**: the step goes to **Ben's** manager, not Emma's
- [ ] ✅ Emma requests for **a new starter**: the step goes to **Emma's** manager

### US-23 Delegation (stand-in while away)
**As an** approver, **I want** a stand-in while I'm away, **so that** requests don't wait for me.

- [ ] ✅ Mary opens **Approvals → Away? → Set a stand-in**, picks Ben with today–Friday, and saves. The card says *"Ben approves for you until …"*
- [ ] ✅ A **new** request needing Mary is sent to **Ben** instead. The step shows "Ben · for Mary"
- [ ] ✅ A request that was **already waiting** for Mary now appears in Ben's "Waiting for me". Ben can approve it, and the step shows "Approved by Ben (stand-in)"
- [ ] ✅ Future dates show as upcoming ("from … to …"), and nothing changes until the start date
- [ ] ✅ **I'm back** clears it, and approvals go to Mary again
- [ ] 🚫 You can't pick yourself. The end date can't be before the start date
- [ ] 🚫 If Mary's stand-in is **Emma** and Emma submits a request that needs Mary, the request still goes to **Mary** (nobody approves their own request)

### US-24 In-flight requests keep their rules
**As an** auditor, **I want** each request judged by the rules it was submitted under.

- [ ] ✅ After submitting, change the item's form, approvers or policy. The submitted request still shows its original questions and its original approval steps
- [ ] ✅ A **draft** is checked against the item **as it is now** at the moment you submit it

---

## 6. Asking for more information (Phase 2)

### US-25 Approver or IT asks the requester a question
**As an** approver or IT agent, **I want to** ask the requester something, **so that** I can decide or fulfil correctly.

- [ ] ✅ An approver whose step is live sees **Ask the requester a question**
- [ ] ✅ An agent sees it when the request is Submitted, Approved or In progress
- [ ] ✅ Sending it changes the status to **Waiting for information** (yellow). The question appears in the conversation and the history, and the requester is notified: *"IT needs more information"*
- [ ] ✅ The IT queue → **Waiting on requester** tab lists it
- [ ] 🚫 A second question while one is open: *"A question is already waiting for an answer"*
- [ ] 🚫 An approver whose step isn't live, or anyone uninvolved, doesn't see the button

### US-26 Requester answers
**As a** requester, **I want to** answer and get my request moving again.

- [ ] ✅ The request page shows *"Mary asked"*, the question, and an answer box
- [ ] ✅ **Send answer**: the request returns to **exactly** the status it left (Pending approval, at the same step, or Approved / Submitted / In progress). The asker and the assignee are notified
- [ ] ✅ The "requested for" colleague can also answer
- [ ] ✅ **Clock pause:** note the due time before asking. After answering, the due time has moved later by roughly the time spent waiting
- [ ] ✅ The requester can cancel while it's waiting for information. IT can cancel only if it had already reached IT before the question

---

## 7. IT fulfilment

### US-27 IT queue
**As an** IT agent, **I want** a queue of everything submitted, **so that** I can pick up work.

- [ ] ✅ Tabs: **Ready** (count) · **In progress** · **Overdue** (count) · **Awaiting approval** (count) · **Waiting on requester** (count) · **Closed**
- [ ] ✅ Filter: Everyone / Unassigned / Assigned to me / a named agent
- [ ] ✅ Search by title, or by number (`SR-000012`, `sr-12`, or `12`)
- [ ] ✅ Rows show the requester, "for" person, assignee (or "unassigned"), priority (when not medium), overdue badge and age
- [ ] ✅ Drafts never appear in the queue

### US-28 Assign and take
- [ ] ✅ The **Handled by** drop-down assigns to any IT agent. The assignee is notified
- [ ] ✅ **Take it** assigns it to yourself
- [ ] 🚫 Assigning to someone who isn't an IT agent is refused
- [ ] 🚫 Fulfilled, Rejected and Cancelled requests can't be reassigned

### US-29 Start work
- [ ] ✅ **Start work** on a Submitted or Approved request moves it to **In progress**, assigns it to you if unassigned, and notifies the requester
- [ ] 🚫 Starting while it's **Pending approval** or **Waiting for information** is impossible (no button; a direct attempt says *"still waiting for approval"*)

### US-30 Fulfil
- [ ] 🚫 **Mark fulfilled** without a note: *"Say what was done"*
- [ ] ✅ With a note, the status is **Fulfilled**. The requester (and the "for" colleague) are notified with the note, and the request page shows it as **What IT did** in green
- [ ] ✅ Activity records whether it was fulfilled on time

### US-31 IT cancels
- [ ] 🚫 Cancelling as IT without a reason: *"Say why it's being cancelled"*
- [ ] ✅ With a reason, the status is **Cancelled**, the requester is told why, and the page shows *"Why it was cancelled"*

### US-32 Conversation and internal notes
**As** anyone on a request, **I want to** talk about it in one place.

- [ ] ✅ The requester, "for" colleague, approvers and IT can comment once it's submitted (not on drafts)
- [ ] ✅ A comment notifies the requester side and the assignee (never the author)
- [ ] ✅ IT can tick **Internal note (IT only)**. It shows in amber with a lock, and only to IT
- [ ] 🚫 Emma never sees internal notes, and can't create one
- [ ] ✅ The item's **How IT fulfils this** notes show in a side card, to IT only

---

## 8. Service levels and escalation (Phase 2)

### US-33 Set service levels
**As an** administrator, **I want to** set how fast approval and fulfilment should be, **so that** we can measure and chase delays.

- [ ] ✅ The **Catalog setup → Service levels** tab shows: hours per approval step; hours to fulfil per priority; escalation percentages; escalation contacts
- [ ] 🚫 Any target below 1 hour is refused. The third escalation % must be greater than the second
- [ ] ✅ An item's own hours (in the item editor, under **Service levels (optional)**) override the defaults for that item
- [ ] ✅ Saving applies to requests from now on (existing due dates don't move)

### US-34 Due dates and overdue flags
- [ ] ✅ Each approval step gets its own due time when it starts. The live step shows "due in Xh" on the Approval card
- [ ] ✅ When a request reaches IT (submitted with no approval, or finally approved), it gets a fulfilment due time, shown as **Fulfilment target**
- [ ] ✅ Past due, a red **Overdue** / **Approval overdue** badge shows on lists and the request page. The IT queue **Overdue** tab lists them, most overdue first

### US-35 Escalation
**As an** IT lead, **I want** late requests escalated automatically, **so that** nothing sits forgotten.

To test quickly, set **hours per approval step = 1** and the escalation % to **50 / 100**. Submit a request
that needs approval, wait just over an hour, then open the app (opening it triggers a check) or wait up to 5 minutes.

- [ ] ✅ **Level 1 (at the due time):** the current approvers (and their stand-ins) get *"Overdue approval: SR-…"*
- [ ] ✅ **Level 2 (+50% of the target = +30 min):** the same people **plus** the escalation contacts (or Admin if none are set) are notified
- [ ] ✅ **Level 3 (+100% = +1 hour):** they are notified again, titled **"Critical — "**
- [ ] ✅ For an overdue **fulfilment**, level 1 goes to the assignee, or to every IT agent if nobody has picked it up
- [ ] ✅ Each level is sent **once**: refreshing many times doesn't repeat notifications
- [ ] ✅ A new approval step starts fresh: its escalations begin from level 1 again
- [ ] ✅ Activity shows "Escalated IT request SR-…: approval overdue (level N)" by *Automatic escalation*
- [ ] ℹ️ If a request is already very late when first checked, only the highest level it has reached is sent

---

## 9. Reports (Phase 2)

### US-36 IT request reports
**As an** IT lead or administrator, **I want** service-delivery reporting, **so that** I can see where things are stuck.

- [ ] ✅ **Reports** is visible to Admin and Agent, and not to Emma (opening `/requests/reports` as Emma redirects her)
- [ ] ✅ **Right now** tiles: open requests, waiting for approval, approvals overdue, ready for IT, fulfilment overdue, waiting on requester. Overdue tiles get an alarm icon when above zero
- [ ] ✅ **Period** (7 / 30 / 90 days / 12 months): submitted, fulfilled, fulfilled on time (% and "x of y"), average approval time, average fulfilment time, escalations sent (and how many were critical), plus rejected and cancelled counts
- [ ] ✅ The **By category** table: submitted, fulfilled, late, average time, open
- [ ] ✅ The **By person** table: fulfilled, in progress, average work time
- [ ] ✅ The **Longest overdue** table links to each request and shows the stage, who it's with, how late it is and the escalation level
- [ ] ✅ The numbers match what you did in the earlier tests

---

## 9b. Automation, connectors and AI (Phase 3, story 2)

**Rule of thumb for this section:** rules decide, AI advises, and nothing skips a required approval.

**Local test connector.** Start the fake connector in a second terminal:
```bash
cd server && node scripts/fakeConnector.js
```
It listens on `http://localhost:4010/hook` and prints every delivery it receives. Set `MODE` to change
how it answers: `succeed`, `fail`, `accept` (answers 202, then calls back after `DELAY` ms), `error`
(answers 503) or `slow`. Set `SECRET` to the connector's signing secret so it checks signatures.

### US-40 Who can set up automation
- [ ] ✅ Admin sees **Catalog setup → Automation**, with **Rules**, **Connectors** and **Run log**
- [ ] 🚫 A custom role with only *Set up IT requests* (no automation permission) sees no Automation tab, and can't tick "Automation rules may approve it" or choose a connector on an item (*"…need the 'Set up IT-request automation' permission"*)
- [ ] ✅ **Roles & access** lists **Set up IT-request automation** with its warning

### US-41 Automation rules
**As an** IT administrator, **I want** rules that shape requests as they come in, **so that** routine work routes itself.
- [ ] ✅ **New rule:** a name, an order, conditions (category, item, priority, risk, new starter, answer equals, text mentions) and at least one action
- [ ] 🚫 A rule with no action is refused
- [ ] ✅ **Try it on the last 50 requests** shows which requests would match, and for auto-approve rules whether each *would* auto-approve or why not
- [ ] ✅ The list reads as a sentence: *"When … then …"*. **Switch off**, **Edit** and **Delete** work
- [ ] ✅ Activity logs rule changes, at **critical** level for a rule that approves automatically

### US-42 What rules do at submit
Create the rule *"Cloud → Agent"*: when the category is Cloud resources, set priority **High**, assign
to **Agent**, and add the internal note "Check the budget code".
- [ ] ✅ Emma submits a cloud request. Once it's approved it reaches IT already **High** priority and assigned to **Agent**
- [ ] ✅ IT sees the internal note *"Automation — Cloud → Agent: Check the budget code"*. Emma doesn't
- [ ] ✅ The request's **Automation** card (IT only) shows *Rule "Cloud → Agent" applied*
- [ ] ✅ Rules apply in order: with two rules setting priority, the higher **order** number wins
- [ ] ✅ A rule that would assign to someone who isn't an IT agent is refused when saved

### US-43 Automatic approval
Make the "Access card" item **low** risk and tick **Automation rules may approve it**. Create the rule
*"Cards auto-approve"*: when the item is Access card, approve automatically.
- [ ] ✅ Emma submits an access-card request. It goes straight to **Approved** with an *"Approved automatically"* badge. Emma is told; IT gets it in **Ready**
- [ ] ✅ The history notes *Approved automatically by the rule "Cards auto-approve"*, and Activity logs it (warning)
- [ ] 🚫 Set the item to **medium** risk and submit again: it goes to its approvers. The Automation card says *Not approved automatically: only low-risk items…*
- [ ] 🚫 Tick **Privileged access**: refused (*privileged access always needs a person*)
- [ ] 🚫 Tick **Requires an identity check**: refused
- [ ] 🚫 Untick **Automation rules may approve it** on the item: refused (*the catalog item doesn't allow automatic approval*)
- [ ] 🚫 Add another rule that flags these requests for review: refused (*a rule flagged it for review*)

### US-44 Flagged for review (AC 2.6)
Create the rule *"Prod needs a look"*: when the text mentions "production", flag for review with the reason "Production access".
- [ ] ✅ A matching request shows an orange **Needs review** banner. IT sees the reason; Emma sees only *"IT is taking a closer look"*
- [ ] ✅ IT queue → **Needs review** (with a count) lists it, and the row badge shows the reason on hover
- [ ] ✅ **Mark as reviewed** clears it, and Activity logs "Reviewed … and cleared the flag"
- [ ] 🚫 A flagged request is never approved or fulfilled automatically while flagged

### US-45 Identity check (BR 1.5 / 2.5)
- [ ] ✅ The starter **Password reset** item already has **Requires an identity check** ticked
- [ ] ✅ On a password-reset request, IT sees the **Identity check** card. **Start work** is disabled with *"Record the identity check first"*
- [ ] 🚫 Calling start or fulfil directly without it: *"Record how you confirmed the requester's identity first"*
- [ ] ✅ Choose a method (e.g. "Call-back to their known phone number"), add a note, then **Record identity check**. Work can now start, and the card shows who confirmed it, how, and when
- [ ] ✅ Emma never sees the method or the note. Activity logs it at warning level

### US-46 Connectors
- [ ] ✅ **New connector:** a name, plus the address `http://localhost:4010/hook` (allowed in development). The **signing secret is shown once**; copy it and restart the fake connector with `SECRET=…`
- [ ] 🚫 In production, `http://…`, private-network addresses and addresses with a user name or password are refused
- [ ] ✅ **Send a test:** *"It answered 200 in N ms"*, and the fake connector prints `event=ping` with `signature: valid`
- [ ] ✅ **Replace secret:** the old one stops working at once (the fake connector shows `INVALID` until you restart it with the new secret)
- [ ] ✅ **Switch off** / **Switch on** work. The card shows "last worked" and "last failed" with the reason
- [ ] 🚫 Deleting a connector used by an item is refused
- [ ] ✅ The address is stored encrypted. The card shows only the origin and path, never a query string

### US-47 Automatic fulfilment: immediate answer
Point **Software licence or access** at the connector (How it's fulfilled → **Automatically, by a connector**). Run the fake connector with `MODE=succeed`.
- [ ] ✅ Submit and approve a software request. Within seconds it moves **In progress → Fulfilled**, with *"Done automatically by …: Fake connector: licence assigned"*. Emma is notified
- [ ] ✅ The fake connector printed the request's reference, title, item and answers, with `signature: valid`
- [ ] ✅ The Automation card shows *Sent to …* as **Succeeded**. Reports → **Fulfilled automatically** goes up

### US-48 Automatic fulfilment: callback
Run the fake connector with `MODE=accept DELAY=10000`.
- [ ] ✅ After approval, the request is **In progress** and the Automation card shows **Waiting for result**
- [ ] ✅ About 10 seconds later the connector calls back and the request becomes **Fulfilled**
- [ ] ✅ Calling the same callback URL again is harmless (`"recorded": false`)
- [ ] 🚫 A callback with a wrong token gets 404 (or 422 if it's not 64 hex characters) and changes nothing
- [ ] ✅ With `RESULT=failed`, the request is flagged **Automation failed** (see US-49)

### US-49 Failures, retries and IT stepping in (AC 2.10–2.11)
- [ ] ✅ `MODE=fail`: the request stays **In progress**, gets **Needs review / Automation failed**, an internal note gives the reason, and IT agents get *"Automation failed"*
- [ ] ✅ `MODE=error`: the Automation card shows **Retrying** with the next attempt time. Retries come after about 1, 5 and 15 minutes (the sweeper runs every 5 minutes, or when someone opens the app). After the last one it fails as above
- [ ] ✅ `MODE=accept` with the fake connector stopped before it calls back: after 24 hours the run fails with *"No result reported within 24 hours"* (optional: shorten this by editing `CALLBACK_TIMEOUT_HOURS`)
- [ ] ✅ **Retry** (on a failed request) sends it again as a new run
- [ ] ✅ **Handle it manually** stops automation: pending retries become *Stepped aside — taken over by …*, the request is assigned to you, and you finish it with **Mark fulfilled** as usual
- [ ] 🚫 **Mark fulfilled** while the connector is working: *"Automation is working on this request — take it over first"*
- [ ] ✅ Turning the connector **off** before a request reaches IT: the run is *Stepped aside* and the request is flagged for review with the reason

### US-50 Self-service link
Set **Password reset or account unlock** to *By the requester, through a self-service link*, with your
identity provider's reset page and the button text "Reset my password".
- [ ] ✅ Opening the item shows a green card, *"You can do this yourself"*, with the button. The form is hidden
- [ ] ✅ Clicking the button opens the link in a new tab, and a request is recorded as **Fulfilled** (*Done through self-service*) in My requests → Closed
- [ ] ✅ **I still need IT** reveals the normal form
- [ ] ✅ Reports → **Self-service** counts it

### US-51 AI: describe what you need
Needs an AI key (Settings → AI) and `ai.use` (Employees and IT agents have it).
- [ ] ✅ The portal shows **Not sure where to start?** Type: *"I'm starting on the design team next week and need Figma and Illustrator"*
- [ ] ✅ **Suggest a request** shows a catalog item, why it fits, and what else you'll need to say
- [ ] ✅ **Continue with this** opens the item's form with the title, answers it could tell, priority and your description filled in, plus a banner: *"Filled in from your description. Check every answer"*
- [ ] ✅ Nothing is submitted until you press Submit
- [ ] ✅ A description that matches nothing says so, and points to browsing or "Something else"
- [ ] 🚫 Someone without AI assistance doesn't see the box

### US-52 AI triage (advisory)
- [ ] ✅ An approver, or IT, sees **AI triage → Get AI triage** on a request
- [ ] ✅ It shows a summary, a suggestion ("Leans towards approving", …) with its reason, risks to weigh, questions to ask, and possibly a suggested priority. Each is labelled *"Advice only — it never approves, rejects or changes anything"*
- [ ] ✅ It's saved on the request (the next approver sees it) and can be refreshed. Emma (the requester) never sees it
- [ ] 🚫 Getting a triage changes no approval, status or priority. Activity logs "Asked AI to triage…"

### US-53 Run log and reports (AC 2.9, 2.12)
- [ ] ✅ **Run log** lists every automated step (rule applied, automatic approval or refusal, connector delivery, self-service, AI triage), filterable by kind and outcome, each linking to its request
- [ ] ✅ **Reports → Automation**: approved automatically (and how many were left to people), fulfilled automatically versus by people, self-service, connector success rate, failures and in-flight runs, needs review now, and failed automation still open

---

## 10. Notifications, audit and security

### US-37 Notifications
- [ ] ✅ Every IT-request notification opens the request (`/requests/<id>`) and shows the IT-requests icon in the bell
- [ ] ✅ Each in-app notification has a matching email (check the mail log or inbox) with an **Open / Review / Reply** button
- [ ] ✅ Nobody is notified about their own action

### US-38 Audit trail
**As an** auditor, **I want** every decision recorded, **so that** we can answer "who approved this and when".

Check **Activity** for these entries after your tests:
- [ ] Requests: submitted, approved (with step), rejected, started, fulfilled, cancelled, assigned
- [ ] Information and files: info requested, info provided, files added, file removed, escalated
- [ ] Setup: catalog item and category created, updated and deleted; approvers changed (warning); approver group and policy created, updated and deleted
- [ ] People and settings: line manager changed, stand-in set or cleared, settings updated
- [ ] ✅ Each request's own **History** card shows every status change, who made it, and their note

### US-39 Access control
**As the** organisation, **I want** people to see only what they're entitled to.

- [ ] 🚫 Emma opening another employee's request URL: *"doesn't exist, or you can't see it"*
- [ ] ✅ An approver can open requests they were asked to approve (including after deciding)
- [ ] ✅ Agents can open every submitted request, but not drafts
- [ ] 🚫 Emma can't open **IT queue**, **Catalog setup** or **Reports** (she is redirected)
- [ ] 🚫 Agent can't open **Catalog setup**
- [ ] 🚫 Sam (client-company supporter) gets no IT-requests pages and no data, even by URL
- [ ] ✅ **Roles & access** in Settings lists a new **IT requests** permission group (Submit IT requests, Work the IT request queue, View IT request reports, Set up IT requests) and the new **Employee** and **IT service agent** roles
- [ ] ✅ Tess (tester) can submit IT requests and still sees all of Testing

---

## 11. Original requirements → where to test them

| Requirement | Tested by |
|---|---|
| Story 1 AC1 Create, view, track | US-08, US-11, US-13 |
| Story 1 AC2 Eight categories | US-03 |
| Story 1 AC3 Category-relevant fields | US-05, US-08 |
| Story 1 AC4 Description, justification, priority, attachments | US-08, US-12 |
| Story 1 AC5 Unique reference | US-10, US-11 |
| Story 1 AC6 Statuses | US-10 – US-14, US-25, US-29 – US-31 |
| Story 1 AC7 Routing by configured rules | US-06, US-17, US-20 – US-22 |
| Story 1 AC8 Notifications | US-37 |
| Story 1 AC9 History and approval progress | US-13, US-20 |
| Story 1 AC10 Audit trail | US-38 |
| Story 1 BR2 No fulfilment before approval | US-29 |
| Story 1 BR6 See only what you're authorised to | US-39 |
| Story 3 AC1–3 Approval queue, details, decide with comments | US-15, US-16 |
| Story 3 AC4 Route approved requests to IT | US-11, US-20 |
| Story 3 AC5 Notify decisions | US-15, US-37 |
| Story 3 AC6 Progress updates and fulfilment details | US-29, US-30, US-32 |
| Story 3 AC7 Flag overdue | US-34 |
| Story 3 AC8 Escalate overdue | US-35 |
| Story 3 AC9 Audit | US-38 |
| Story 3 BR1 Only designated approvers | US-15, US-17, US-39 |
| Story 3 BR2 Not beyond assigned authority | US-19 |
| Story 3 BR3 Configured approval sequence | US-20, US-21 |
| Story 3 BR4 Rejections kept with reasons | US-15 |
| Story 3 TN2 Sequential or parallel approvals | US-20, US-21 |
| Story 3 TN3 Timestamps | US-13 (History), US-36 |
| Story 3 TN4 Dashboards and reports | US-36 |
| Story 2 AC1–3 Analyse against rules, find routine requests, route to approvers | US-41, US-42, US-20 |
| Story 2 AC4 Automatic approval only where authorised | US-43 |
| Story 2 AC5 Automatic fulfilment of eligible requests | US-47, US-48, US-50 |
| Story 2 AC6 Flag for information, review or more approval | US-44, US-25 |
| Story 2 AC7 Block automation until approvals, identity and checks are satisfied | US-43, US-45, US-49 |
| Story 2 AC8 Notify of automatic outcomes | US-43, US-47, US-49 |
| Story 2 AC9 Record automated actions, rules, decisions, results, errors | US-53, US-42 |
| Story 2 AC10 IT can review and intervene | US-44, US-49 |
| Story 2 AC11 Escalate failed automation | US-49 |
| Story 2 AC12 Automation reports | US-53 |
| Story 2 BR1 AI never overrides approvals | US-52 |
| Story 2 BR5 Identity verification for password resets | US-45, US-50 |
| Story 2 TN1 AI-assisted classification and routing | US-51, US-52 |
| Story 2 TN4 Secured connectors | US-46, US-48 |

---

## 12. Reporting a problem

For anything that fails, note:
1. **Story and check:** e.g. *US-20, "Fin can't decide while step 1 is still with Mary"*
2. **Who you were signed in as**
3. **Request reference:** e.g. `SR-000014`
4. **What you expected vs what happened**, plus any error message, and the server log line if you have it
