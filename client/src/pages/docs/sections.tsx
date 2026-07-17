// pages/docs/sections.tsx — the documentation content, one entry per section.
// Content is authored as JSX (no markdown renderer in the project); keep the
// helper components below in sync so every section reads consistently.
import type { ReactNode } from "react"
import {
  Activity,
  BookOpen,
  Bug,
  CircleHelp,
  FileText,
  FolderKanban,
  Image,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  PlayCircle,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react"
import shotDashboard from "@/assets/docs/dashboard.png"
import shotGettingStarted from "@/assets/docs/getting-started.png"
import shotRoles from "@/assets/docs/roles.png"
import shotProjects from "@/assets/docs/projects.png"
import shotSuitesAndCases from "@/assets/docs/suites-and-cases.png"
import shotTestRuns from "@/assets/docs/test-runs.png"
import shotBugs from "@/assets/docs/bugs.png"
import shotFeatureRequests from "@/assets/docs/feature-requests.png"
import shotFeedbackPortal from "@/assets/docs/feedback-portal.png"
import shotTeam from "@/assets/docs/team.png"
import shotAnnouncements from "@/assets/docs/announcements.png"
import shotActivity from "@/assets/docs/activity.png"
import shotSettings from "@/assets/docs/settings.png"

export interface DocSection {
  id: string
  title: string
  icon: LucideIcon
  /** One-line description shown under the section heading. */
  summary: string
  body: ReactNode
}

// ── Typography helpers ─────────────────────────────────────────────────────────
function P({ children }: { children: ReactNode }) {
  return <p className="leading-7 text-muted-foreground">{children}</p>
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold text-foreground">{children}</h3>
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 text-muted-foreground [&>li]:leading-7">{children}</ul>
}

function OL({ children }: { children: ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-2 text-muted-foreground [&>li]:leading-7">{children}</ol>
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

/**
 * Screenshot slot. Renders a placeholder until a real capture is supplied:
 * import the image and pass it as `src` — the caption stays as the alt text.
 */
function Screenshot({ caption, src }: { caption: string; src?: string }) {
  if (src) {
    return (
      <figure className="my-4">
        <img src={src} alt={caption} className="w-full rounded-lg border shadow-sm" />
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">{caption}</figcaption>
      </figure>
    )
  }
  return (
    <figure
      className="my-4 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 text-muted-foreground"
      data-cy="docs-screenshot-placeholder"
    >
      <Image className="size-8 opacity-50" aria-hidden />
      <figcaption className="px-4 text-center text-sm">{caption}</figcaption>
      <span className="text-xs opacity-70">Screenshot coming soon</span>
    </figure>
  )
}

/** Inline status/priority chip. */
function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

/** Multi-line code sample (curl, JSON). */
function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
      <code>{children}</code>
    </pre>
  )
}

/** Inline code — a field name, header, or short value. */
function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>
}

const chipSlate = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
const chipBlue = "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
const chipAmber = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
const chipRed = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
const chipGreen = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
const chipViolet = "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
const chipZinc = "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"

// ── Sections ───────────────────────────────────────────────────────────────────
const ALL_SECTIONS: DocSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: BookOpen,
    summary: "What TestMate is and how it is organised.",
    body: (
      <div className="space-y-4">
        <P>
          <Strong>TestMate</Strong> is a test management platform for software teams. It gives your
          organisation one place to plan testing work, execute it, and track everything that falls
          out of it — bugs, feature requests, and tickets from the people using your product.
        </P>
        <P>Everything in TestMate lives inside your organisation and is organised as:</P>
        <UL>
          <li>
            <Strong>Projects</Strong> — the top-level container, usually one per product or product
            area. Each project holds test suites, test runs, feature requests, bugs, and tickets.
          </li>
          <li>
            <Strong>Test suites</Strong> — groups of related test cases inside a project (for
            example “Checkout”, “Authentication”).
          </li>
          <li>
            <Strong>Test cases</Strong> — the individual, repeatable checks with steps and an
            expected result.
          </li>
          <li>
            <Strong>Test runs</Strong> — an execution of a suite where testers record pass/fail
            results case by case.
          </li>
        </UL>
        <P>
          Around that core, TestMate adds bug tracking, feature requests with voting and comments, a
          public ticket portal for external users, team management, an activity log, and a
          dashboard that rolls all of it up.
        </P>
        <Screenshot caption="TestMate at a glance — the dashboard after signing in" src={shotDashboard} />
      </div>
    ),
  },
  {
    id: "getting-started",
    title: "Getting started",
    icon: Rocket,
    summary: "Creating an organisation, verifying your email, and signing in.",
    body: (
      <div className="space-y-4">
        <H3>Create your organisation</H3>
        <OL>
          <li>
            Open the <Strong>Register</Strong> page and fill in your name, company name, email, and a
            password (city and country are optional).
          </li>
          <li>
            Check your inbox for a verification email and follow the link. You must verify your
            email before you can use the app.
          </li>
          <li>Sign in with your email and password, or with your Google account.</li>
        </OL>
        <Screenshot caption="The registration page — creating a new organisation" src={shotGettingStarted} />
        <P>
          Registering creates a new organisation with you as its administrator. Teammates don’t
          register themselves — you add them from the <Strong>Team</Strong> page (see{" "}
          <a href="#team" className="font-medium text-primary hover:underline">Team management</a>),
          and they sign in with the credentials you set up.
        </P>
        <H3>Forgot your password?</H3>
        <P>
          Use the <Strong>Forgot password?</Strong> link on the sign-in page. You’ll receive an
          email with a link to choose a new password. You can also change your password anytime from{" "}
          <Strong>Settings → Security</Strong>.
        </P>
        <H3>First steps after signing in</H3>
        <OL>
          <li>Create your first project from the <Strong>Projects</Strong> page.</li>
          <li>Add team members and assign them to the project.</li>
          <li>Create a test suite, add test cases, then start a test run.</li>
        </OL>
        <P>
          New administrators get an interactive <Strong>guided tour</Strong> on first sign-in, and
          you can replay any tour from <Strong>Settings → Help</Strong>.
        </P>
      </div>
    ),
  },
  {
    id: "roles",
    title: "Roles & permissions",
    icon: ShieldCheck,
    summary: "Company Admin and User — who sees what.",
    body: (
      <div className="space-y-4">
        <P>TestMate has two roles:</P>
        <UL>
          <li>
            <Strong>User</Strong> — works on testing: sees the dashboard and the projects they are
            assigned to, executes runs, reports bugs, and submits feature requests.
          </li>
          <li>
            <Strong>Company Admin</Strong> — everything a User can do, plus managing the team,
            viewing the organisation-wide activity log, and administrative views on the dashboard.
          </li>
        </UL>
        <Screenshot caption="The sidebar navigation, with the role preview menu open" src={shotRoles} />
        <H3>Project visibility is assignment-scoped</H3>
        <P>
          Regular users only see the projects they have been added to as members. If a project you
          expect is missing from your list, ask an administrator to add you to it. Within a project,
          members can hold one of two project roles: <Strong>Member</Strong> or{" "}
          <Strong>Team Lead</Strong>.
        </P>
        <H3>Previewing as another role</H3>
        <P>
          Administrators can temporarily <Strong>preview the app as a lower role</Strong> from the
          user menu at the bottom of the sidebar — useful for checking what a teammate will actually
          see. Use <Strong>Exit preview</Strong> in the same menu to switch back.
        </P>
      </div>
    ),
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    summary: "A live overview of testing across your projects.",
    body: (
      <div className="space-y-4">
        <P>
          The dashboard is your landing page after sign-in. It summarises testing activity across
          every project you can see:
        </P>
        <Screenshot caption="The dashboard — totals, charts, pass rate, and recent runs" src={shotDashboard} />
        <UL>
          <li>
            <Strong>Totals</Strong> — projects, suites, test cases, and runs at a glance.
          </li>
          <li>
            <Strong>Case breakdowns</Strong> — test cases by status and by priority.
          </li>
          <li>
            <Strong>Result breakdown &amp; pass rate</Strong> — how executed cases split across{" "}
            <Chip className={chipGreen}>Pass</Chip> <Chip className={chipRed}>Fail</Chip>{" "}
            <Chip className={chipAmber}>Blocked</Chip> <Chip className={chipSlate}>Skipped</Chip>{" "}
            and <Chip className={chipSlate}>Not Run</Chip>.
          </li>
          <li>
            <Strong>Per-project and per-suite breakdowns</Strong> — where the cases live and how
            each suite is doing.
          </li>
          <li>
            <Strong>Recent runs</Strong> — the latest test runs with their summaries.
          </li>
        </UL>
        <P>
          Administrators additionally see <Strong>top performers</Strong> (testers ranked by
          executed results and pass rate) and organisation-wide <Strong>feature request</Strong> and{" "}
          <Strong>bug</Strong> status breakdowns.
        </P>
      </div>
    ),
  },
  {
    id: "projects",
    title: "Projects",
    icon: FolderKanban,
    summary: "Creating projects and managing their members.",
    body: (
      <div className="space-y-4">
        <P>
          Projects are the top-level container for all testing work. From the{" "}
          <Strong>Projects</Strong> page you can search, browse, and create projects.
        </P>
        <H3>Creating a project</H3>
        <OL>
          <li>Click <Strong>New project</Strong> and give it a name and optional description.</li>
          <li>
            Add members from your team, choosing <Strong>Member</Strong> or{" "}
            <Strong>Team Lead</Strong> for each. Only assigned members (plus admins) can see the
            project.
          </li>
        </OL>
        <H3>Inside a project</H3>
        <P>A project’s detail page is organised into five tabs:</P>
        <Screenshot caption="A project's detail page with its five tabs" src={shotProjects} />
        <UL>
          <li><Strong>Test Suites</Strong> — the suites and cases that make up your test plan.</li>
          <li><Strong>Test Runs</Strong> — executions of those suites.</li>
          <li><Strong>Feature Requests</Strong> — ideas and improvements, with voting and comments.</li>
          <li><Strong>Bug Fixes</Strong> — reported bugs and their lifecycle.</li>
          <li><Strong>Tickets</Strong> — submissions from the public ticket portal.</li>
        </UL>
      </div>
    ),
  },
  {
    id: "suites-and-cases",
    title: "Test suites & cases",
    icon: FileText,
    summary: "Bulk-importing from the template, exporting, and writing test cases.",
    body: (
      <div className="space-y-4">
        <P>
          A <Strong>test suite</Strong> groups related test cases. Create suites from the project’s{" "}
          <Strong>Test Suites</Strong> tab, then open a suite to manage its cases. You can add cases
          one at a time, or — usually faster — prepare them in a spreadsheet and import them in bulk.
        </P>

        <H3>The import template</H3>
        <P>
          TestMate only imports <Strong>.xlsx</Strong> files that follow its own template. Open a
          suite, click <Strong>Import</Strong>, then <Strong>Download template</Strong> to get the
          pre-formatted sheet. Fill it in using these columns, in the order the template lays them
          out (<Strong>*</Strong> marks a required column):
        </P>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">What to enter</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">ID *</td>
                <td className="px-3 py-2 text-muted-foreground">
                  A unique value for each row — numbers, codes, or IDs from your own tracker all
                  work. TestMate uses it to skip duplicates, both within the file and against cases
                  already imported into the suite. Every row must have one.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Feature *</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The test case title. Merged/blank cells carry forward — rows with an empty
                  Feature inherit the title of the row above, so grouped scenarios import cleanly.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Test Scenario</td>
                <td className="px-3 py-2 text-muted-foreground">
                  A description of what the case verifies.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Steps to Execute *</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The actions the tester performs, one per line (e.g. “1. Navigate to… 2. Enter…”).
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Expected Result *</td>
                <td className="px-3 py-2 text-muted-foreground">
                  What should happen if the software behaves correctly.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Severity *</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <Chip className={chipSlate}>Low</Chip> <Chip className={chipBlue}>Medium</Chip>{" "}
                  <Chip className={chipAmber}>High</Chip> <Chip className={chipRed}>Critical</Chip>{" "}
                  — the sheet gives you a dropdown. This becomes the case’s priority.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">Tags</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Comma-separated labels, e.g. <Strong>smoke, validation</Strong>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <P>
          Keep the columns exactly as downloaded — files with renamed, missing, or extra columns
          are rejected. Uploading shows a <Strong>preview before anything is saved</Strong>: rows
          with problems are listed with their reasons, duplicates are flagged, and you confirm the
          import only once the preview looks right.
        </P>

        <H3>Exporting</H3>
        <P>
          Every suite — and every project — has an <Strong>Export</Strong> button that downloads
          the cases as an .xlsx report, including steps, expected results, priority, status, tags,
          assignees, deadlines, the latest run result, and attachment links. Use it for sharing,
          reviews, or backups. Note that exports are full reports, not import files — to bulk-add
          cases, always start from the downloaded template.
        </P>

        <H3>Anatomy of a test case</H3>
        <UL>
          <li><Strong>Title & description</Strong> — what is being verified.</li>
          <li><Strong>Steps</Strong> — an ordered list of actions the tester performs.</li>
          <li><Strong>Expected result</Strong> — what should happen if the software behaves correctly.</li>
          <li>
            <Strong>Priority</Strong> — <Chip className={chipSlate}>Low</Chip>{" "}
            <Chip className={chipBlue}>Medium</Chip> <Chip className={chipAmber}>High</Chip>{" "}
            <Chip className={chipRed}>Critical</Chip>.
          </li>
          <li>
            <Strong>Status</Strong> — <Chip className={chipSlate}>Draft</Chip>{" "}
            <Chip className={chipGreen}>Active</Chip> <Chip className={chipZinc}>Deprecated</Chip>.
            Keep work-in-progress cases as drafts; deprecate cases you no longer run instead of
            deleting them.
          </li>
          <li>
            <Strong>Tags, assignees, deadline, attachments</Strong> — organise cases, assign owners,
            set a due date, and attach screenshots or reference files.
          </li>
        </UL>
        <Screenshot caption="A test case — steps, expected result, priority, and status" src={shotSuitesAndCases} />
      </div>
    ),
  },
  {
    id: "test-runs",
    title: "Test runs",
    icon: PlayCircle,
    summary: "Executing a suite and recording results.",
    body: (
      <div className="space-y-4">
        <P>
          A <Strong>test run</Strong> is one execution of a suite. Create a run from the project’s{" "}
          <Strong>Test Runs</Strong> tab (pick a name and the suite to run); the run starts{" "}
          <Chip className={chipAmber}>In Progress</Chip> and includes the suite’s cases.
        </P>
        <H3>Recording results</H3>
        <P>Open the run and work through each case. For every case you record:</P>
        <Screenshot caption="Recording pass/fail results inside a test run" src={shotTestRuns} />
        <UL>
          <li>
            A <Strong>status</Strong> — <Chip className={chipGreen}>Pass</Chip>{" "}
            <Chip className={chipRed}>Fail</Chip> <Chip className={chipAmber}>Blocked</Chip> or{" "}
            <Chip className={chipSlate}>Skipped</Chip>. Cases not yet executed show as{" "}
            <Chip className={chipSlate}>Not Run</Chip>.
          </li>
          <li>
            The <Strong>actual result</Strong> — what really happened, especially when it differs
            from the expected result.
          </li>
          <li><Strong>Notes</Strong> — any extra context for the team.</li>
        </UL>
        <P>
          Each result records who executed it and when. The run’s summary (pass / fail / blocked /
          skipped / pending counts) updates as you go, and the run can be marked{" "}
          <Chip className={chipGreen}>Completed</Chip> when finished. Failures can be turned
          directly into bug reports linked back to the case and run.
        </P>
      </div>
    ),
  },
  {
    id: "bugs",
    title: "Bug tracking",
    icon: Bug,
    summary: "Reporting bugs and moving them through their lifecycle.",
    body: (
      <div className="space-y-4">
        <P>
          Bugs live in the project’s <Strong>Bug Fixes</Strong> tab. A bug report captures the
          title, a description, <Strong>steps to reproduce</Strong>, expected vs actual behaviour,
          and the environment it occurred in, plus optional file attachments. Bugs can be linked to
          the test case and test run that uncovered them.
        </P>
        <Screenshot caption="A bug report — severity, priority, status, and reproduction steps" src={shotBugs} />
        <H3>Severity & priority</H3>
        <UL>
          <li>
            <Strong>Severity</Strong> (impact): <Chip className={chipSlate}>Trivial</Chip>{" "}
            <Chip className={chipBlue}>Minor</Chip> <Chip className={chipAmber}>Major</Chip>{" "}
            <Chip className={chipRed}>Critical</Chip>
          </li>
          <li>
            <Strong>Priority</Strong> (urgency): <Chip className={chipSlate}>Low</Chip>{" "}
            <Chip className={chipBlue}>Medium</Chip> <Chip className={chipAmber}>High</Chip>{" "}
            <Chip className={chipRed}>Urgent</Chip>
          </li>
        </UL>
        <H3>Lifecycle</H3>
        <P>
          A bug moves through <Chip className={chipSlate}>Open</Chip> →{" "}
          <Chip className={chipAmber}>In Progress</Chip> → <Chip className={chipBlue}>Fixed</Chip> →{" "}
          <Chip className={chipViolet}>Verified</Chip> → <Chip className={chipGreen}>Closed</Chip>.
          If a closed bug resurfaces it can be <Chip className={chipRed}>Reopened</Chip>. Bugs can be
          assigned to a team member, and the report tracks who reported it and when each status
          change happened.
        </P>
      </div>
    ),
  },
  {
    id: "feature-requests",
    title: "Feature requests",
    icon: Lightbulb,
    summary: "Proposing ideas, voting, and discussing them in realtime.",
    body: (
      <div className="space-y-4">
        <P>
          Feature requests live in the project’s <Strong>Feature Requests</Strong> tab. Anyone on
          the project can submit one with a title, description, optional category and module, and
          supporting material — file attachments and reference links.
        </P>
        <Screenshot caption="A feature request — upvotes, comments, and admin response" src={shotFeatureRequests} />
        <H3>Voting & comments</H3>
        <P>
          Teammates can <Strong>upvote</Strong> requests they care about, which helps prioritise.
          Each request has a <Strong>comment thread that updates in realtime</Strong> — you’ll see
          new comments from teammates appear without refreshing.
        </P>
        <H3>Statuses</H3>
        <P>
          Admins triage requests through <Chip className={chipSlate}>New</Chip> →{" "}
          <Chip className={chipBlue}>Under Review</Chip> → <Chip className={chipViolet}>Planned</Chip>{" "}
          → <Chip className={chipAmber}>In Progress</Chip> → <Chip className={chipGreen}>Done</Chip>{" "}
          (or <Chip className={chipZinc}>Rejected</Chip>), optionally attaching an{" "}
          <Strong>admin response</Strong> explaining the decision.
        </P>
      </div>
    ),
  },
  {
    id: "feedback-portal",
    title: "Public ticket portal",
    icon: MessageSquare,
    summary: "Collecting tickets from people outside your organisation.",
    body: (
      <div className="space-y-4">
        <P>
          Every project can have a <Strong>public ticket link</Strong> — a token-gated form that
          external users (customers, stakeholders, beta testers) can open{" "}
          <Strong>without a TestMate account</Strong>. Share the link from the project’s{" "}
          <Strong>Tickets</Strong> tab.
        </P>
        <H3>What submitters see</H3>
        <P>
          The form asks for the ticket type — <Strong>Feature request</Strong>,{" "}
          <Strong>Bug</Strong>, or <Strong>Complaint</Strong> — a title and description, the product
          area it relates to, their name, email, optional phone number, and optional screenshots.
        </P>
        <Screenshot caption="The public ticket form external users see" src={shotFeedbackPortal} />
        <H3>Lifecycle & email updates</H3>
        <P>
          Submissions land in the project’s Tickets tab where your team manages them through{" "}
          <Chip className={chipSlate}>Logged</Chip> → <Chip className={chipBlue}>Acknowledged</Chip>{" "}
          → <Chip className={chipViolet}>Assigned</Chip> →{" "}
          <Chip className={chipAmber}>Investigating</Chip> → <Chip className={chipGreen}>Resolved</Chip>{" "}
          → <Chip className={chipBlue}>Awaiting confirmation</Chip> →{" "}
          <Chip className={chipGreen}>Closed</Chip>.
        </P>
        <P>
          The submitter is kept in the loop by email as the status changes. When a fix reaches{" "}
          <Strong>Awaiting confirmation</Strong>, they get a link to confirm the issue is resolved —
          or to reopen it with a reason if it isn’t. Tickets can be assigned to team members, and a
          timeline shows how long it spent in each stage.
        </P>
      </div>
    ),
  },
  {
    id: "partner-integration",
    title: "Partner integration API",
    icon: Webhook,
    summary: "Let another product create and check tickets programmatically.",
    body: (
      <div className="space-y-4">
        <P>
          Instead of (or alongside) the public ticket link, another product — say, a partner
          company's own website — can raise tickets on a user's behalf and let that same user
          check their status, without ever leaving the partner's app. This is a{" "}
          <Strong>server-to-server</Strong> API: the partner's backend calls TestMate and renders
          the result itself.
        </P>
        <P>
          Tickets created this way land in the key's owning{" "}
          <Strong>client company's IT support queue</Strong> — exactly like a submission through
          that company's public ticket form — not straight to the product team. The product team
          only sees them once IT support escalates.
        </P>
        <H3>Getting an API key</H3>
        <P>
          On a project's <Strong>Tickets</Strong> tab, under <Strong>Client companies</Strong>,
          each company has its own <Strong>Integration API key</Strong> — separate from that
          company's public form link, and separate from every other company on the project. A
          project with several client companies (several partners) issues one key per company;
          each partner's tickets only ever reach their own company's queue. The raw key is shown{" "}
          <Strong>once</Strong>, at generation or rotation — store it on the partner's side;
          TestMate only ever keeps a hash of it. Revoking a key immediately breaks any integration
          still using it.
        </P>
        <P>Every request authenticates with the key in an <Code>x-api-key</Code> header.</P>
        <H3>Create a ticket</H3>
        <P><Code>POST /api/v1/integrations/tickets</Code></P>
        <CodeBlock>{`curl -X POST https://<your-domain>/api/v1/integrations/tickets \\
  -H "x-api-key: <key>" -H "Content-Type: application/json" \\
  -d '{
    "type": "bug",
    "title": "Export fails",
    "description": "CSV export returns a 500",
    "submitterName": "Jane Doe",
    "submitterEmail": "jane@example.com",
    "externalRef": "PARTNER-1001"
  }'`}</CodeBlock>
        <P>
          <Code>externalRef</Code> is optional — it's the partner's own id for the request. If a
          create call is retried with the same <Code>externalRef</Code>, TestMate returns the{" "}
          <Strong>original</Strong> ticket instead of creating a duplicate, so a network retry is
          always safe. The response includes TestMate's own <Code>ticketNumber</Code> — a short
          human-readable id (e.g. <Code>#4821</Code>) worth surfacing in the partner's UI alongside
          <Code> id</Code>, since that's what shows up in TestMate's own screens and emails too.
        </P>
        <H3>Check a ticket's status, or list a submitter's history</H3>
        <P><Code>GET /api/v1/integrations/tickets/:id</Code> — a single ticket.</P>
        <P>
          <Code>GET /api/v1/integrations/tickets?submitterEmail=jane@example.com</Code> — every
          ticket that submitter has raised with this company (their "history").
        </P>
        <H3>Customer-facing status</H3>
        <P>
          These endpoints intentionally return a <Strong>simplified status</Strong>, not TestMate's
          internal triage stages — so a user never sees something as finished while your team is
          still reviewing or double-checking it. Before escalation, the ticket is progressing
          through IT support's own queue; after escalation, it's progressing through the product
          team's:
        </P>
        <UL>
          <li><Chip className={chipSlate}>received</Chip> — logged, not yet started.</li>
          <li>
            <Chip className={chipBlue}>in_progress</Chip> — anywhere from acknowledged through a
            claimed fix (internal product-team <Chip className={chipGreen}>Resolved</Chip>{" "}
            deliberately still reads as <Chip className={chipBlue}>in_progress</Chip> here — it
            hasn't been confirmed with the submitter yet).
          </li>
          <li>
            <Chip className={chipAmber}>pending_your_confirmation</Chip> — the product team
            believes it's fixed and is waiting on the submitter to confirm (only reachable after
            IT support has escalated).
          </li>
          <li>
            <Chip className={chipGreen}>resolved</Chip> — closed. Either IT support resolved it
            locally (no separate confirmation step at that tier), or the product team's fix was
            confirmed by the submitter after an escalation.
          </li>
        </UL>
      </div>
    ),
  },
  {
    id: "team",
    title: "Team management",
    icon: Users,
    summary: "Adding, editing, and deactivating users (admins).",
    body: (
      <div className="space-y-4">
        <P>
          The <Strong>Team</Strong> page (visible to admins) lists everyone in your organisation
          with their role and a <Strong>presence dot</Strong> showing who is online right now.
        </P>
        <Screenshot caption="The Team page — members, roles, and online presence" src={shotTeam} />
        <UL>
          <li>
            <Strong>Add user</Strong> — create an account for a teammate and choose their role. They
            sign in with the credentials you set up and verify their email.
          </li>
          <li><Strong>Edit</Strong> — update a user’s details or role.</li>
          <li>
            <Strong>Deactivate</Strong> — remove a user’s access without deleting their history.
          </li>
          <li><Strong>Search</Strong> — find users by name or email.</li>
        </UL>
      </div>
    ),
  },
  {
    id: "announcements",
    title: "What's New",
    icon: Megaphone,
    summary: "Product updates that appear in the What's New dialog.",
    body: (
      <div className="space-y-4">
        <P>
          TestMate ships release notes and product updates as <Strong>announcements</Strong>. When
          there’s something you haven’t seen yet, a <Strong>What’s New</Strong> dialog pops up after
          you sign in, so the whole team hears about changes without leaving the app.
        </P>
        <Screenshot caption="The What's New dialog announcing recent updates" src={shotAnnouncements} />
      </div>
    ),
  },
  {
    id: "activity",
    title: "Activity log",
    icon: Activity,
    summary: "An audit trail of what happened across the organisation.",
    body: (
      <div className="space-y-4">
        <P>
          The <Strong>Activity</Strong> page (visible to admins, at the bottom of the sidebar) is a
          chronological log of actions across your organisation — who created, changed, or executed
          what, and when. Use it to audit changes or catch up after time away.
        </P>
        <Screenshot caption="The activity log — a chronological audit trail" src={shotActivity} />
      </div>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    summary: "Profile, security, guided tours, and theme.",
    body: (
      <div className="space-y-4">
        <UL>
          <li>
            <Strong>Profile</Strong> — your personal information: name, email, and address details.
          </li>
          <li>
            <Strong>Security</Strong> — change your password (you’ll need your current one).
          </li>
          <li>
            <Strong>Help</Strong> — replay the interactive <Strong>guided tours</Strong> that walk
            you through key workflows step by step. Some tours need at least one project to exist.
          </li>
        </UL>
        <P>
          The <Strong>theme toggle</Strong> in the top-right corner of the app (and of this page)
          switches between light, dark, and system themes. Notifications arrive under the{" "}
          <Strong>bell icon</Strong> in the header.
        </P>
        <Screenshot caption="Settings — profile, security, and help tabs" src={shotSettings} />
      </div>
    ),
  },
  {
    id: "faq",
    title: "FAQ",
    icon: CircleHelp,
    summary: "Quick answers to common questions.",
    body: (
      <div className="space-y-5">
        <div>
          <H3>I can’t see a project I should be working on.</H3>
          <P>
            Project visibility is assignment-scoped: you only see projects you’re a member of. Ask a
            Company Admin (or the project’s owner) to add you as a member.
          </P>
        </div>
        <div>
          <H3>How do my teammates get accounts?</H3>
          <P>
            Admins create accounts from the <Strong>Team</Strong> page — teammates don’t register
            themselves. Registration is only for creating a brand-new organisation.
          </P>
        </div>
        <div>
          <H3>Can people outside my organisation report issues?</H3>
          <P>
            Yes — share the project’s public ticket link. Submitters don’t need an account and get
            email updates as their ticket progresses. See{" "}
            <a href="#feedback-portal" className="font-medium text-primary hover:underline">
              Public ticket portal
            </a>.
          </P>
        </div>
        <div>
          <H3>What’s the difference between a bug’s severity and priority?</H3>
          <P>
            <Strong>Severity</Strong> measures impact (how bad it is when it happens);{" "}
            <Strong>priority</Strong> measures urgency (how soon it should be fixed). A cosmetic
            typo on the homepage might be Trivial severity but High priority.
          </P>
        </div>
        <div>
          <H3>Should I delete outdated test cases?</H3>
          <P>
            Prefer marking them <Chip className={chipZinc}>Deprecated</Chip> — you keep the history
            of past runs while excluding them from future work.
          </P>
        </div>
      </div>
    ),
  },
]

// ── Groups ─────────────────────────────────────────────────────────────────────
// Sidebar grouping. Group order defines the page's render order.
export interface DocGroup {
  label: string
  sections: DocSection[]
}

const byId = Object.fromEntries(ALL_SECTIONS.map((s) => [s.id, s]))
const group = (label: string, ids: string[]): DocGroup => ({
  label,
  sections: ids.map((id) => byId[id]),
})

export const DOC_GROUPS: DocGroup[] = [
  group("Getting started", ["introduction", "getting-started", "roles"]),
  group("Core testing workflow", ["dashboard", "projects", "suites-and-cases", "test-runs"]),
  group("Tracking & tickets", ["bugs", "feature-requests", "feedback-portal", "partner-integration"]),
  group("Administration", ["team", "activity"]),
  group("Help", ["announcements", "settings", "faq"]),
]

export const DOC_SECTIONS: DocSection[] = DOC_GROUPS.flatMap((g) => g.sections)
