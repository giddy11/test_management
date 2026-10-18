// pages/docs/sections.tsx — the documentation content, one entry per section.
// Content is authored as JSX (no markdown renderer in the project); keep the
// helper components below in sync so every section reads consistently.
import type { ReactNode } from "react"
import {
  Activity,
  BookOpen,
  Bug,
  Building2,
  CircleHelp,
  FileText,
  FolderKanban,
  Image,
  LayoutDashboard,
  Lightbulb,
  Link2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PlayCircle,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
  Sparkles,
  Store,
  ListChecks,
  Inbox,
  Settings2,
  Bot,
  BarChart3,
  ClipboardList,
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
import shotClientCompanies from "@/assets/docs/client-companies.png"
import shotSupportQueue from "@/assets/docs/support-queue.png"
import shotLiveChat from "@/assets/docs/live-chat.png"
import shotLiveChatWidget from "@/assets/docs/live-chat-widget.png"

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
 * Pass `narrow` for portrait captures (e.g. the chat widget), which would be
 * absurdly tall stretched to the full column width.
 */
function Screenshot({ caption, src, narrow }: { caption: string; src?: string; narrow?: boolean }) {
  if (src) {
    return (
      <figure className="my-4">
        <img
          src={src}
          alt={caption}
          className={`rounded-lg border shadow-sm ${narrow ? "mx-auto w-full max-w-72" : "w-full"}`}
        />
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

/**
 * A worked AI example: what the person types, and what the AI gives back.
 * `result` is a list of [field, value] rows; a value ending in " *" is shown
 * as an AI suggestion the person must confirm.
 */
function AiExample({ title, you, result, notes }: { title: string; you: string; result: [string, string][]; notes?: ReactNode }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border">
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-foreground">
        <Sparkles className="size-3.5 text-primary" aria-hidden /> {title}
      </div>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b p-3 md:border-r md:border-b-0">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">You write</p>
          <p className="text-sm italic leading-6 text-foreground">“{you}”</p>
        </div>
        <div className="p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">The AI fills in</p>
          <dl className="space-y-1 text-sm">
            {result.map(([field, value]) => {
              const suggested = value.endsWith(" *")
              return (
                <div key={field} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
                  <dt className="text-muted-foreground">{field}</dt>
                  <dd className="text-foreground">
                    {suggested ? value.slice(0, -2) : value}
                    {suggested && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">suggestion — confirm</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      </div>
      {notes && <div className="border-t bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">{notes}</div>}
    </div>
  )
}

/** A small reference table: first row is the header. */
function DocTable({ rows }: { rows: ReactNode[][] }) {
  const [head, ...body] = rows
  return (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 leading-6 text-muted-foreground">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A labelled mock-up of what someone sees on screen. */
function Mock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="my-4">
      <div className="rounded-lg border border-dashed bg-muted/30 p-4">{children}</div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

/** A highlighted note — rules worth remembering. */
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">{children}</div>
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
          public ticket portal for external users, a live chat widget you can embed on your own
          website, a two-tier support model for client companies with their own IT desk, team
          management, an activity log, and a dashboard that rolls all of it up.
        </P>
        <P>Two more things are built on the same foundation:</P>
        <UL>
          <li>
            <Strong>AI assistance</Strong> — describe a bug or an idea in your own words and the AI
            fills in the form for you to check. Your organisation brings its own AI provider key.
            See{" "}
            <a href="#ai-assistant" className="font-medium text-primary hover:underline">AI assistance</a>.
          </li>
          <li>
            <Strong>IT requests</Strong> — a separate module where employees ask IT for software,
            hardware, accounts and access; requests are approved, fulfilled (by people or
            automatically) and tracked. It shares sign-in, people and the activity log with
            testing, but has its own section in the sidebar and can be switched on or off. See{" "}
            <a href="#it-requests" className="font-medium text-primary hover:underline">IT requests</a>.
          </li>
        </UL>
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
    summary: "Built-in and custom roles, project roles, and who sees what.",
    body: (
      <div className="space-y-4">
        <P>
          What someone can do is decided by <Strong>permissions</Strong>, grouped into{" "}
          <Strong>roles</Strong>. A person can hold more than one role and gets everything their
          roles allow. Hiding a button is only a courtesy — the server checks every permission on
          every request.
        </P>
        <H3>Built-in roles</H3>
        <UL>
          <li>
            <Strong>Organisation administrator</Strong> — everything inside your organisation:
            people, roles, every project, reporting, AI keys and credits, and setting up IT requests
            and their automation.
          </li>
          <li>
            <Strong>Test lead</Strong>, <Strong>QA engineer</Strong>, <Strong>Tester</Strong> — work
            in the projects they belong to. They differ in exporting projects and seeing analytics.
            What they can do <em>inside</em> a project comes from their project role (below). All
            three can use AI drafting and submit IT requests.
          </li>
          <li>
            <Strong>Employee</Strong> — asks IT for things through{" "}
            <a href="#it-requests" className="font-medium text-primary hover:underline">IT requests</a>{" "}
            and follows their own requests. Sees nothing of testing.
          </li>
          <li>
            <Strong>IT service agent</Strong> — works the IT request queue: picks requests up,
            fulfils them, and sees IT request reports.
          </li>
          <li>
            <Strong>Support lead</Strong> — someone <Strong>outside</Strong> your organisation, at
            one of your{" "}
            <a href="#client-companies" className="font-medium text-primary hover:underline">client companies</a>
            . They see only their own company’s ticket queue — never your projects, tests or
            dashboard — and escalate what they can’t fix to you.
          </li>
        </UL>
        <P>
          Built-in roles keep their names, but an administrator can change what each may do. For
          anything else, create a <Strong>custom role</Strong> under{" "}
          <Strong>Settings → Roles &amp; access</Strong> and assign it on the <Strong>Team</Strong>{" "}
          page. Permissions that are easy to misuse (granting roles, approving automatically,
          sending data to other systems) carry a warning in the role editor, and nobody can grant
          a permission they don’t hold themselves.
        </P>
        <Screenshot caption="The sidebar navigation, with the role preview menu open" src={shotRoles} />
        <H3>Project roles: member and team lead</H3>
        <P>
          You only see projects you’ve been added to (administrators see all of them). Inside a
          project you’re a <Strong>Member</Strong> — you take part: run tests, report bugs, raise
          feature requests — or a <Strong>Team Lead</Strong>, who also manages: cases and suites,
          triage, assignment, client companies and the project itself. If a project is missing from
          your list, ask an administrator to add you.
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

        <H3>SLA &amp; support tab</H3>
        <P>
          The second tab tracks the support tickets raised through your public ticket portal
          against your organisation's SLA rules. Every figure is computed over the same filtered
          set of tickets, and clicking any card, bar or row drills down to the tickets behind it.
        </P>
        <UL>
          <li>
            <Strong>Tickets raised</Strong> — bugs, feature requests and complaints over time,
            with resolutions overlaid.
          </li>
          <li>
            <Strong>First response time</Strong> — from ticket creation to the first staff reply
            or stage change, on either the IT support or product team side.
          </li>
          <li>
            <Strong>Resolution time</Strong> — from creation to the ticket being resolved (locally
            by IT support, or by the product team), minus any time in a paused stage.
          </li>
          <li>
            <Strong>Waiting tickets</Strong> — open tickets, how long they've waited, and which
            have had no response yet.
          </li>
          <li>
            <Strong>SLA compliance &amp; breaches</Strong> — met vs breached against the target
            for each ticket's severity. Open tickets are judged on a live clock, so breaches
            appear automatically as targets pass.
          </li>
          <li>
            <Strong>Issues by severity, status, product, team member and support engineer</Strong>.
          </li>
          <li>
            <Strong>Most recurring issues</Strong> — the bug, ticket and feature request that keep
            being raised, each ranked with how many times, how many are still open, and whether it
            came back after being fixed. See{" "}
            <a href="#linked-tickets" className="text-primary hover:underline">Repeats &amp; related tickets</a>.
          </li>
        </UL>
        <P>
          Filter by date range, product, client company, status, severity, type, team member,
          support engineer, or ticket code. Administrators set the targets per severity and pick
          which stages pause the clock under <Strong>SLA rules</Strong>; QA users see the projects
          they belong to.
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
        <P>A project’s detail page is organised into six tabs:</P>
        <Screenshot caption="A project's detail page and its tabs" src={shotProjects} />
        <UL>
          <li><Strong>Test Suites</Strong> — the suites and cases that make up your test plan.</li>
          <li><Strong>Test Runs</Strong> — executions of those suites.</li>
          <li><Strong>Feature Requests</Strong> — ideas and improvements, with voting and comments.</li>
          <li><Strong>Bug Fixes</Strong> — reported bugs and their lifecycle.</li>
          <li>
            <Strong>Tickets</Strong> — submissions from the public ticket portal, plus the
            project’s public form link and its client companies.
          </li>
          <li>
            <Strong>Live Chat</Strong> — the operator inbox for the embeddable chat widget, and
            (for admins) the widget’s settings.
          </li>
        </UL>
        <P>
          The <Strong>Project ID</Strong> shown under the project name is what the{" "}
          <a href="#company-provisioning" className="font-medium text-primary hover:underline">
            provisioning API
          </a>{" "}
          uses to identify this project.
        </P>
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
        <P>
          Made a mistake? Open the bug and click <Strong>Edit</Strong> to correct the title,
          description, steps, expected/actual behaviour, environment, or linked test case. The
          person who reported a bug can edit it, as can admins and the project’s team lead.
          Severity, priority, status and assignee are changed by admins and team leads through{" "}
          <Strong>Manage</Strong>.
        </P>
        <P>
          A report can only be edited <Strong>while the bug is Open or Reopened</Strong>. As soon
          as work starts — In Progress, Fixed, Verified or Closed — the report is locked for
          everyone, admins included, so the team is always acting on what was actually reported.
          If a fixed bug resurfaces and is Reopened, the report unlocks again so it can be
          corrected or updated with what you now know.
          The <Strong>Edit</Strong> button stays visible but greyed out, and its tooltip says why.
          Managing the bug (status, severity, priority, assignee), comments and attachments are not
          affected. If something was missed, add it as a comment.
        </P>
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
        <H3>Reference codes &amp; shareable links</H3>
        <P>
          Every bug gets a human-readable reference code like <Code>BF-20260728-014</Code> — the
          date it was reported plus its number in a single running sequence. Quote it in standups,
          commit messages, or chat instead of a long id. The <Strong>Copy link</Strong> button on a
          bug copies a permalink built from that code (
          <Code>/projects/…/bugs/ref/BF-20260728-014</Code>), so the link stays readable and keeps
          working. Feature requests work the same way with an <Code>FR-</Code> prefix.
        </P>
        <H3>Write it with AI</H3>
        <P>
          Open <Strong>AI assistant — describe the bug in your own words</Strong> at the top of the
          form, write what happened however it comes to you, and press{" "}
          <Strong>Draft with AI</Strong>. The AI fills in the title, description, steps, expected
          and actual behaviour, and environment, suggests a severity and priority with a reason, and
          asks about anything missing. Nothing is reported until you press the form’s own button.
          See{" "}
          <a href="#ai-assistant" className="font-medium text-primary hover:underline">AI assistance</a>{" "}
          for a worked example.
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
        <H3>Reference codes &amp; shareable links</H3>
        <P>
          Each request carries a reference code like <Code>FR-20260728-014</Code>, and{" "}
          <Strong>Copy link</Strong> gives you a permalink built from it (
          <Code>/projects/…/feature-requests/ref/FR-20260728-014</Code>) — readable enough to paste
          into a roadmap doc or a chat message. Bugs use the same scheme with a <Code>BF-</Code>{" "}
          prefix.
        </P>
        <H3>Write it with AI</H3>
        <P>
          The form’s <Strong>AI assistant — describe your idea in your own words</Strong> turns a
          rough idea into a clear request: problem, proposed solution, business justification,
          expected outcome and acceptance criteria. Parts the AI inferred rather than read from you
          are marked <Strong>AI suggestion — please confirm</Strong>. See{" "}
          <a href="#ai-assistant" className="font-medium text-primary hover:underline">AI assistance</a>.
        </P>
      </div>
    ),
  },
  {
    id: "linked-tickets",
    title: "Repeats & related tickets",
    icon: Link2,
    summary: "Spotting a problem that has been raised before, and counting how often it comes back.",
    body: (
      <div className="space-y-4">
        <P>
          A bug that was fixed months ago can come back, and a customer can report the same problem
          your tester logged last week. Instead of losing track, link the reports together — bugs,
          feature requests and tickets can all be linked to one another, as long as they belong to
          the same project.
        </P>
        <H3>Has this been raised before?</H3>
        <P>
          As you type the title of a new bug or feature request, TestMate looks through the
          project’s earlier bugs, feature requests and tickets — including ones that are already
          fixed or closed — for titles that read alike. Anything close appears under the title as{" "}
          <Strong>This may have been raised before</Strong>, with its status and date. Nothing is
          blocked: your report is saved either way, so a match that turns out to be a different
          problem costs you nothing.
        </P>
        <UL>
          <li>
            <Strong>Same problem</Strong> — record your new report as a <Strong>repeat</Strong> of
            the earlier one. Once you submit, the two are linked.
          </li>
          <li>
            <Strong>Related</Strong> — the two are connected (same area, a likely cause, a
            workaround) but not the same problem. Related links don’t count as repeats.
          </li>
        </UL>
        <P>
          The match is by wording, so it catches “Sign up button broken” against “Sign up button
          not working”, but not a report worded completely differently (“can’t create an
          account”). That’s why a ticket’s page also lets you <Strong>search and link by hand</Strong>{" "}
          — type a title or paste a reference code like <Code>BF-20260728-014</Code>.
        </P>
        <H3>Counting how many times</H3>
        <P>
          The earlier report is the <Strong>original</Strong>; every later report of the same
          problem is a <Strong>repeat</Strong> of it. The original shows{" "}
          <Chip className={chipAmber}>Reported 3 times</Chip> in its header and in the project list,
          and its <Strong>Related tickets</Strong> section lists every report — oldest first, with
          each one’s status — so you can see when it came back and whether it was fixed the same way.
          A repeat shows a small <Strong>Repeat</Strong> badge and the same list.
        </P>
        <H3>Planning from the SLA dashboard</H3>
        <P>
          The <Strong>Most recurring issues</Strong> card on the SLA dashboard pulls these counts
          together so you can see what deserves planning time. It headlines the most-reported bug,
          the most-reported ticket and the most-requested feature, and lists the top offenders of
          each kind. Every row shows:
        </P>
        <UL>
          <li>
            <Strong>Reports</Strong> and how many are still <Strong>open</Strong>.
          </li>
          <li>
            <Strong>After a fix</Strong> — reports filed after the problem had already been fixed
            once. This is the strongest signal: the fix may not have reached the root cause. Rows
            like this are marked <Chip className={chipRed}>Came back after a fix</Chip>.
          </li>
          <li>
            <Strong>Votes</Strong> for feature requests, and the <Strong>average fix time</Strong>.
          </li>
        </UL>
        <P>
          Each row ends with one line of plain advice — for example <em>“2 of 5 reports are still
          open — a strong candidate to prioritise”</em>. Click a row to list every report behind it.
          Reports you linked as repeats count together however they were worded; unlinked reports
          are grouped only when their titles are identical, so linking is what keeps the counts
          honest. The card follows the dashboard’s filters, so narrow it by product or date range to
          plan for one area.
        </P>
        <H3>Linking from a ticket’s page</H3>
        <P>
          Open a bug, feature request or ticket and click <Strong>Link ticket</Strong> in its{" "}
          <Strong>Related tickets</Strong> section. Pick a ticket, then say how they relate: this
          ticket is a repeat of the one you picked, the one you picked is a repeat of this one, or
          they’re simply related. Tickets with a similar title that aren’t linked yet are suggested
          underneath as <Strong>Possible repeats</Strong>, each with a one-click{" "}
          <Strong>Same problem</Strong> button.
        </P>
        <UL>
          <li>
            A ticket is a repeat of <Strong>one</Strong> original. If you pick a ticket that is
            itself a repeat, the link goes to the original instead, so the count stays in one place.
          </li>
          <li>
            An original that already has repeats can’t itself be marked as a repeat of something
            else — remove its repeats’ links first.
          </li>
          <li>
            Anyone who can report bugs on the project can add a link. Whoever added a link can
            remove it, and so can admins and the project’s team lead. Removing a link never deletes
            either ticket.
          </li>
        </UL>
        <P>
          Tickets that are still in a client company’s own IT queue aren’t visible to your team, so
          they can’t be linked until they are escalated.
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
        <H3>Ticket codes</H3>
        <P>
          Every submission gets a reference code like <Code>TKT-20260728-042</Code> — the date it
          was raised plus its number in a running sequence. It’s shown to your team and to the
          submitter, so both sides can refer to the same ticket unambiguously.
        </P>
        <H3>Lifecycle &amp; email updates</H3>
        <P>
          Submissions land in the project’s Tickets tab where your team manages them through{" "}
          <Chip className={chipSlate}>Logged</Chip> → <Chip className={chipBlue}>Acknowledged</Chip>{" "}
          → <Chip className={chipViolet}>Assigned</Chip> →{" "}
          <Chip className={chipAmber}>Investigating</Chip> → <Chip className={chipGreen}>Resolved</Chip>{" "}
          → <Chip className={chipGreen}>Closed</Chip>.
        </P>
        <P>
          The submitter is kept in the loop by email as the status changes. There’s no
          confirmation step to close the loop — if a <Strong>Resolved</Strong> fix doesn’t actually
          hold, the submitter just says so in the ticket’s conversation thread. Tickets can be
          assigned to team members, and a timeline shows how long it spent in each stage.
        </P>
        <H3>Talking to the submitter</H3>
        <P>
          Each ticket has a <Strong>conversation thread</Strong> that both sides can post to. Your
          team replies from the ticket’s dialog; the submitter replies from “My tickets” (below) —
          no account needed either way. Messages appear <Strong>in realtime</Strong> on both sides,
          and either side can attach up to five files per message (images, PDF, Word, Excel; 10 MB
          each) — handy for asking a customer for a log file or a screenshot.
        </P>
        <H3>“My tickets” — self-service status lookup</H3>
        <P>
          Submitters can check on everything they’ve ever raised at <Code>/my-tickets</Code>. They
          enter the email they submitted with, receive a 6-digit code by email, and see all their
          tickets across every project and company. From there they can read the conversation,
          reply, raise another ticket for the same product, and — once a ticket is resolved — leave
          a <Strong>1–5 star rating</Strong> of the support they got. The code stays valid for a
          while, so they don’t need a new one on every visit.
        </P>
        <P>
          Their view deliberately hides your internal triage detail: statuses collapse to{" "}
          <Chip className={chipSlate}>Received</Chip> <Chip className={chipAmber}>In progress</Chip>{" "}
          and <Chip className={chipGreen}>Resolved</Chip>. A ticket only reads as resolved to them
          once your team actually closes it.
        </P>
        <H3>Tickets across every project</H3>
        <P>
          <Strong>All tickets</Strong> in the sidebar is the same list without the per-project
          clicking — every ticket from every project you can see, filterable by project, status,
          type, and free-text search. Tickets still sitting in a client company’s own IT queue don’t
          appear here until that company escalates them (see{" "}
          <a href="#client-companies" className="font-medium text-primary hover:underline">
            Client companies &amp; IT support
          </a>
          ).
        </P>
      </div>
    ),
  },
  {
    id: "client-companies",
    title: "Client companies & IT support",
    icon: Building2,
    summary: "Give a customer's own IT desk the first pass at their users' tickets.",
    body: (
      <div className="space-y-4">
        <P>
          If your product is used by other organisations, you probably don’t want every one of their
          end users filing tickets straight into your queue. A <Strong>client company</Strong> is
          one of those customer organisations, with its own <Strong>IT support</Strong> accounts who
          triage their users’ tickets first — and escalate to you only what they can’t resolve
          themselves.
        </P>
        <Screenshot
          caption="The client companies card on a project's Tickets tab"
          src={shotClientCompanies}
        />
        <H3>Adding a client company</H3>
        <P>
          Admins manage client companies from the project’s <Strong>Tickets</Strong> tab. Adding one
          asks for the company name, an optional contact email, and the details of its{" "}
          <Strong>first IT supporter</Strong> (name, email, password) — that account is created at
          the same time and automatically becomes the company’s <Strong>primary lead</Strong>. They
          get an invite email with their sign-in details, and their email is already verified, so
          they can sign in right away.
        </P>
        <P>
          Each company gets <Strong>its own ticket form link</Strong>, enabled from the moment it’s
          created. Submissions through that link go to <Strong>that company’s</Strong> queue, not
          yours — unlike the project-level link, whose submissions come straight to you.
        </P>
        <H3>Supporters and leads</H3>
        <P>
          Beyond that first account, a company manages its own roster: its{" "}
          <Strong>IT support lead</Strong> uses <Strong>Manage my team</Strong> in their portal to
          add, remove, and promote supporters. Your admins can only step in to bootstrap a company
          that has no supporters at all — the ordinary roster is the customer’s own business. A few
          guardrails apply:
        </P>
        <UL>
          <li>A company with supporters must always have at least one lead — demote or remove the last one and TestMate asks you to promote someone first.</li>
          <li>Leads can’t remove themselves or change their own lead status — that’s how someone locks themselves out.</li>
          <li>The <Strong>primary lead</Strong> can only be changed or removed by the product team, not by a peer lead.</li>
          <li>A company must have zero supporters before it can be deleted.</li>
        </UL>
        <H3>The ticket queue</H3>
        <P>
          Signing in as an IT supporter lands on <Strong>Ticket queue</Strong> instead of the
          dashboard — their company’s tickets only, with tabs per stage and filters by type and
          assignee. The workflow is strictly sequential, and{" "}
          <Strong>the end user is emailed at every stage change</Strong>:
        </P>
        <P>
          <Chip className={chipSlate}>Logged</Chip> → <Chip className={chipBlue}>Acknowledged</Chip>{" "}
          → <Chip className={chipAmber}>Investigating</Chip>, and from Investigating only, either{" "}
          <Chip className={chipGreen}>Resolved locally</Chip> (a note is required and is emailed to
          the submitter — final immediately, no confirmation step; if the fix doesn't hold they just
          say so in the ticket's conversation thread) or{" "}
          <Chip className={chipViolet}>Escalated</Chip> to your product team.
        </P>
        <UL>
          <li>
            A ticket must be <Strong>assigned to a supporter before it can be acknowledged</Strong>{" "}
            — nobody is on the hook for an unclaimed ticket.
          </li>
          <li>
            Leads can act on anything in their queue and assign work to teammates; a non-lead
            supporter can only act on tickets assigned to them.
          </li>
          <li>
            <Strong>Auto-assign</Strong> (off by default, switched on by the company’s lead) routes
            each new ticket straight to the least-busy supporter and notifies only them, instead of
            alerting the whole queue.
          </li>
        </UL>
        <Screenshot caption="An IT supporter's ticket queue" src={shotSupportQueue} />
        <H3>Escalation, and what you see</H3>
        <P>
          Escalating asks for a <Strong>severity</Strong> (<Chip className={chipSlate}>Low</Chip>{" "}
          <Chip className={chipBlue}>Medium</Chip> <Chip className={chipAmber}>High</Chip>{" "}
          <Chip className={chipRed}>Critical</Chip>) telling your team how urgent it is, plus an
          optional note that stays internal — the submitter never sees it. Escalation can’t be
          undone.
        </P>
        <P>
          Only escalated tickets reach your project’s Tickets tab and the All tickets list; you then
          work them through the normal ticket lifecycle. The supporter keeps watching your progress
          from their own queue. Once you close the ticket, they get a{" "}
          <Strong>Notify submitter — it’s fixed</Strong> action to relay the news in their own words:
          the end user hears from the IT desk they contacted, not from a system they’ve never used.
        </P>
        <P>
          After escalation the ticket’s conversation thread becomes three-way — the submitter, the
          escalating company’s IT support, and your product team all post to the same thread, each
          badged so it’s clear who is speaking.
        </P>
      </div>
    ),
  },
  {
    id: "live-chat",
    title: "Live chat widget",
    icon: MessageCircle,
    summary: "Embed a chat widget on your own site and answer from inside TestMate.",
    body: (
      <div className="space-y-4">
        <P>
          Live chat is for the conversations that shouldn’t become tickets — a visitor on your
          marketing site or in your product with a quick question. You embed a widget on your own
          website; your team answers from the project’s <Strong>Live Chat</Strong> tab.
        </P>
        <H3>Turning it on</H3>
        <OL>
          <li>
            Open the project’s <Strong>Live Chat</Strong> tab and click{" "}
            <Strong>Enable live chat</Strong> (admins only).
          </li>
          <li>
            Copy the embed snippet and paste it into your site’s HTML, just before{" "}
            <Code>&lt;/body&gt;</Code>:
          </li>
        </OL>
        <CodeBlock>{`<script async
  src="https://<your-domain>/live-chat-widget.js"
  data-token="<your widget token>"></script>`}</CodeBlock>
        <P>
          That’s the whole integration. The script adds a floating launcher and renders the chat in
          an isolated iframe, so it can’t collide with your site’s own styles or scripts — and it
          goes fullscreen on small screens. <Strong>Disable</Strong> revokes the token and takes the
          widget down everywhere it’s embedded.
        </P>
        <Screenshot
          caption="What a visitor sees when they open the widget on your site"
          src={shotLiveChatWidget}
          narrow
        />
        <H3>Widget settings</H3>
        <Screenshot caption="The widget's embed snippet and settings" src={shotLiveChat} />
        <UL>
          <li><Strong>Display name</Strong> — the name at the top of the widget (defaults to the project name).</li>
          <li><Strong>Brand color</Strong> — matches the widget to your site.</li>
          <li><Strong>Greeting message</Strong> — the first thing a visitor reads.</li>
          <li><Strong>Offline message</Strong> — shown when nobody is around to answer.</li>
          <li>
            <Strong>Require a TestMate account to chat</Strong> — off by default. When off, visitors
            fill in a short pre-chat form (email required; name and phone optional) and start
            typing. When on, they log in or sign up first, which lets them pick their conversation
            back up from any device.
          </li>
        </UL>
        <H3>Answering from the inbox</H3>
        <P>
          Below the settings, the tab is a two-pane inbox: conversations on the left with unread
          badges and the visitor’s last message, the live thread on the right. Anyone on the project
          can read and reply; admins additionally see the settings card.
        </P>
        <UL>
          <li>
            Conversations move through <Chip className={chipSlate}>New</Chip>{" "}
            <Chip className={chipAmber}>In progress</Chip> <Chip className={chipGreen}>Resolved</Chip>{" "}
            <Chip className={chipZinc}>Closed</Chip> — the first two are set automatically as the
            conversation gets going, the last two by you. A closed conversation can be reopened.
          </li>
          <li>
            <Strong>Assign to me</Strong> claims a conversation so teammates know it’s covered;
            unassign to hand it back.
          </li>
          <li>
            Replies are realtime in both directions, and messages can carry file attachments.
          </li>
        </UL>
      </div>
    ),
  },
  {
    id: "company-provisioning",
    title: "Company provisioning API",
    icon: Webhook,
    summary: "Auto-create a client company when it signs up on your side.",
    body: (
      <div className="space-y-4">
        <P>
          Setting up a new client company by hand is fine for a handful of companies, but doesn't
          scale if your own product signs up new customers on its own. This{" "}
          <Strong>server-to-server</Strong> endpoint lets your backend call TestMate the moment
          one of your customers registers, creating the{" "}
          <a href="#client-companies" className="font-medium text-primary hover:underline">
            client company
          </a>{" "}
          record immediately.
        </P>
        <P>
          This endpoint takes no API key — the request identifies its target project directly
          with <Code>projectId</Code>. An admin can copy a project's id from the small "Project
          ID" row under its name at the top of the project page.
        </P>
        <H3>Provision a company</H3>
        <P><Code>POST /api/v1/integrations/companies</Code></P>
        <CodeBlock>{`curl -X POST https://<your-domain>/api/v1/integrations/companies \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "<project id>",
    "name": "Acme Corp",
    "contactEmail": "billing@acme.com",
    "supporter": {
      "firstName": "Jamie",
      "lastName": "Ops",
      "email": "jamie@acme.com"
    }
  }'`}</CodeBlock>
        <P>
          <Code>contactEmail</Code> is optional; <Code>supporter</Code> isn't — same as the in-app
          "Add client company" flow, the company's first IT support account (its primary lead) is
          created in the same call, so there's no window where the company's tickets sit in a queue
          nobody can see. There's no <Code>password</Code> field: your backend isn't a human
          choosing one, so TestMate generates one and emails it to <Code>supporter.email</Code> via
          the usual invite.
        </P>
        <H3>Response — <Code>201 Created</Code></H3>
        <P>
          The company's ticket form link is enabled immediately, so a success response carries the
          new <Code>company</Code> with a ready-to-share <Code>feedbackUrl</Code> (the raw{" "}
          <Code>feedbackToken</Code> is included too, if you'd rather build the URL yourself). The
          supporter account is created but <Strong>not</Strong> returned — their generated password
          reaches them only in the invite email.
        </P>
        <CodeBlock>{`{
  "success": true,
  "message": "Client company provisioned",
  "statusCode": 201,
  "data": {
    "company": {
      "id": "b1c2d3e4-6f7a-4b2c-9d1e-0a1b2c3d4e5f",
      "projectId": "a1a2a3a4-b5b6-47c8-9d0e-1f2a3b4c5d6e",
      "name": "Acme Corp",
      "contactEmail": "billing@acme.com",
      "feedbackToken": "ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "feedbackUrl": "https://<your-domain>/feedback/ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "autoAssignEnabled": false,
      "supporterCount": 0,
      "createdAt": "2026-08-29T12:34:56.789Z"
    }
  },
  "errors": []
}`}</CodeBlock>
        <P>
          Every response — success or error — uses this same envelope: <Code>success</Code>,{" "}
          <Code>message</Code>, <Code>statusCode</Code>, <Code>data</Code>, and an{" "}
          <Code>errors</Code> array (empty on success).
        </P>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.id</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string (uuid)</td>
                <td className="px-3 py-2 text-muted-foreground">
                  TestMate's id for the new client company. Use it for the authenticated{" "}
                  <Code>/api/v1/client-companies/:id/*</Code> endpoints.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.projectId</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string (uuid)</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The project this company was created under — echoes the <Code>projectId</Code> you
                  sent.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.name</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">The company name you sent.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.contactEmail</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string | null</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The billing/contact address you sent, or <Code>null</Code> if you omitted it.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.feedbackToken</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string (uuid) | null</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The secret token for this company's public ticket form. Always set here (the form
                  is enabled on creation); only <Code>null</Code> if an admin later disables the link.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.feedbackUrl</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string | null</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The full ticket-form URL — TestMate's app origin plus{" "}
                  <Code>/feedback/&lt;feedbackToken&gt;</Code>. Share this with the company's users.{" "}
                  <Code>null</Code> whenever <Code>feedbackToken</Code> is.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.autoAssignEnabled</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">boolean</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Whether incoming tickets auto-assign to the company's least-busy supporter. Always{" "}
                  <Code>false</Code> for a new company — only their own IT support lead can turn it on.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.supporterCount</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">number</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Supporter accounts on the company. Reported as <Code>0</Code> in this response even
                  though the first supporter was just created; fetch the company later for the live
                  count.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">data.company.createdAt</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string (ISO 8601)</td>
                <td className="px-3 py-2 text-muted-foreground">When the company record was created.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <P>
          Need more than one supporter, or to add one later? Use the company's{" "}
          <Strong>Supporters</Strong> panel (or{" "}
          <Code>POST /api/v1/client-companies/:id/supporters</Code>, authenticated) — same as any
          other client company.
        </P>
        <H3>Error responses</H3>
        <P>
          Errors use the same envelope with <Code>success: false</Code> and a human-readable{" "}
          <Code>message</Code>. Validation failures also populate <Code>errors</Code> with one{" "}
          <Code>{`{ field, message }`}</Code> entry per invalid field (e.g.{" "}
          <Code>{`{ "field": "body.supporter.email", "message": "Invalid email" }`}</Code>).
        </P>
        <P>
          <Code>data</Code> is <Code>null</Code> on most errors — <Strong>except</Strong> the three{" "}
          409s below when the conflicting company or account belongs to the{" "}
          <Code>projectId</Code> you sent: then <Code>data.company</Code> carries that existing
          company in the same shape as a successful create, so a retried or duplicate call (e.g. a
          retry after a timeout) can still recover its <Code>feedbackUrl</Code> instead of just
          hitting a dead end. A conflict against a <Strong>different</Strong> project's company never
          returns its details — <Code>data</Code> stays <Code>null</Code> — so this can't be used to
          probe other tenants' data.
        </P>
        <P>
          <Strong>Example — <Code>409 Conflict</Code> with a recoverable company:</Strong>
        </P>
        <CodeBlock>{`{
  "success": false,
  "message": "A client company with this contact email already exists",
  "statusCode": 409,
  "data": {
    "company": {
      "id": "b1c2d3e4-6f7a-4b2c-9d1e-0a1b2c3d4e5f",
      "projectId": "a1a2a3a4-b5b6-47c8-9d0e-1f2a3b4c5d6e",
      "name": "Acme Corp",
      "contactEmail": "billing@acme.com",
      "feedbackToken": "ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "feedbackUrl": "https://<your-domain>/feedback/ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "autoAssignEnabled": false,
      "supporterCount": 1,
      "createdAt": "2026-08-29T12:34:56.789Z"
    }
  },
  "errors": []
}`}</CodeBlock>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"><Code>message</Code></th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">422</td>
                <td className="px-3 py-2 text-muted-foreground">Validation failed</td>
                <td className="px-3 py-2 text-muted-foreground">
                  A field is missing or malformed — bad <Code>projectId</Code>, empty{" "}
                  <Code>name</Code>, invalid email, missing <Code>supporter</Code>. See{" "}
                  <Code>errors</Code> for specifics.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">404</td>
                <td className="px-3 py-2 text-muted-foreground">Project not found</td>
                <td className="px-3 py-2 text-muted-foreground">
                  No project matches <Code>projectId</Code> (or it was deleted).
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">409</td>
                <td className="px-3 py-2 text-muted-foreground">An account with this email already exists</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <Code>supporter.email</Code> already belongs to a TestMate user. If that user
                  supports a company under this same <Code>projectId</Code>,{" "}
                  <Code>data.company</Code> is that company.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">409</td>
                <td className="px-3 py-2 text-muted-foreground">A client company with this contact email already exists</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <Code>contactEmail</Code> is already the contact address for another client company.
                  If that company is under this same <Code>projectId</Code>, <Code>data.company</Code>{" "}
                  is that company — the common case for a retried call.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">409</td>
                <td className="px-3 py-2 text-muted-foreground">This email already belongs to a user account</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <Code>contactEmail</Code> matches an existing user's address. If that user supports
                  a company under this same <Code>projectId</Code>, <Code>data.company</Code> is that
                  company.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">429</td>
                <td className="px-3 py-2 text-muted-foreground">Too many requests — please slow down</td>
                <td className="px-3 py-2 text-muted-foreground">
                  More than 20 calls to this endpoint in a 60-second window. Back off and retry.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">500</td>
                <td className="px-3 py-2 text-muted-foreground">Internal server error</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Unexpected failure. If the supporter couldn't be created the half-made company is
                  rolled back, so a retry is safe.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <H3>Security notes</H3>
        <UL>
          <li>This endpoint has no credential check — anyone who knows (or guesses) a <Code>projectId</Code> can create companies inside that project. Treat the URL itself as sensitive, and don't expose it to untrusted clients.</li>
          <li>Only call it from your backend — never from frontend JavaScript or a mobile app bundle, where the request (and your <Code>projectId</Code>) would be visible to anyone.</li>
          <li>There's no idempotency key here — a same-email retry after an uncertain response (e.g. a timeout) still fails with a <Code>409</Code>. If the retry targets the <Strong>same</Strong> <Code>projectId</Code> as the original call, that response's <Code>data.company</Code> is the company that was actually created, so you can recover from it safely; only a cross-project conflict leaves you with no way to tell whether the original call succeeded.</li>
        </UL>
      </div>
    ),
  },
  {
    id: "ticket-form-api",
    title: "Ticket submission API",
    icon: Webhook,
    summary: "Build your own ticket form and post straight into TestMate.",
    body: (
      <div className="space-y-4">
        <P>
          The <a href="#feedback-portal" className="font-medium text-primary hover:underline">
            public ticket portal
          </a>{" "}
          works by sending people to TestMate's own hosted <Code>/feedback/&lt;token&gt;</Code> page.
          If you'd rather keep them on your own product entirely — your own layout, your own fields
          arranged your way — build that form yourself and call the same two endpoints it uses
          under the hood. No page navigation, no TestMate branding.
        </P>
        <P>
          These take the project's (or client company's) <Code>feedbackToken</Code> — the same one
          in the hosted link — as the only credential, so there's nothing to authenticate up front.
          Copy it from the project's <Strong>Tickets</Strong> tab (or a client company's own page).
        </P>
        <H3>Get the form's context</H3>
        <P><Code>GET /api/v1/public/feedback/&lt;token&gt;</Code></P>
        <P>
          Call this first to get what you need to render the form — the product name (and, for a
          client company's token, which company will triage it first), plus its list of test suites
          for an optional "which part of the application" field.
        </P>
        <CodeBlock>{`curl https://<your-domain>/api/v1/public/feedback/fd6afc72-537c-4335-b24b-e34d97dc88cb`}</CodeBlock>
        <CodeBlock>{`{
  "success": true,
  "message": "Feedback form",
  "statusCode": 200,
  "data": {
    "projectName": "DOMS",
    "clientCompanyName": "Slotbeer Construction",
    "suites": [
      { "id": "b3c1a2e4-1111-4b2c-9d1e-0a1b2c3d4e5f", "name": "Payments" },
      { "id": "c4d2b3f5-2222-4b2c-9d1e-0a1b2c3d4e5f", "name": "Onboarding" }
    ]
  },
  "errors": []
}`}</CodeBlock>
        <P>
          <Code>clientCompanyName</Code> is <Code>null</Code> for a project-level token. Skip the
          "part of the application" field entirely if <Code>suites</Code> is empty — that's what the
          hosted form does too.
        </P>
        <H3>Submit a ticket</H3>
        <P><Code>POST /api/v1/public/feedback/&lt;token&gt;</Code></P>
        <P>
          <Code>multipart/form-data</Code> — required so screenshots can ride along with the other
          fields in one request.
        </P>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">type</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">
                  One of <Code>feature_request</Code>, <Code>bug</Code>, <Code>complaint</Code>.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">title</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">1–200 characters.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">description</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">1–5000 characters.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">suiteName</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string, optional</td>
                <td className="px-3 py-2 text-muted-foreground">
                  A <Code>name</Code> from the <Code>suites</Code> list above — free text, not
                  validated against it. Omit if the submitter doesn't know or it doesn't apply.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">submitterName</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">1–120 characters.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">submitterEmail</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Where lifecycle updates and the "My tickets" lookup code are sent.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">submitterPhone</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string, optional</td>
                <td className="px-3 py-2 text-muted-foreground">
                  E.164 format, e.g. <Code>+2348012345678</Code>.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">images</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">file[], optional</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <Strong>The actual image file bytes</Strong> (multipart), not a URL — up to 5
                  files, PNG/JPEG/WebP only, 5&nbsp;MB each. Repeat the{" "}
                  <Code>images</Code> field once per file. TestMate uploads them to its own
                  storage and hands back a URL in the ticket's <Code>attachments</Code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock>{`curl -X POST https://<your-domain>/api/v1/public/feedback/fd6afc72-537c-4335-b24b-e34d97dc88cb \\
  -F "type=complaint" \\
  -F "title=Invoice totals look wrong" \\
  -F "description=The tax line doesn't match what's on the PDF export." \\
  -F "submitterName=Jamie Ops" \\
  -F "submitterEmail=jamie@acme.com" \\
  -F "submitterPhone=+2348012345678" \\
  -F "images=@screenshot-1.png"`}</CodeBlock>
        <H3>Response — <Code>201 Created</Code></H3>
        <CodeBlock>{`{
  "success": true,
  "message": "Thanks! Your feedback has been logged.",
  "statusCode": 201,
  "data": { "id": "e3f4a5b6-7c8d-4e9f-a0b1-c2d3e4f5a6b7" },
  "errors": []
}`}</CodeBlock>
        <P>
          That's the ticket's internal <Code>id</Code>, not its human-readable reference code (e.g.{" "}
          <Code>TKT-20260915-007</Code>) — the hosted form doesn't show that either, it just confirms
          submission and relies on the confirmation email for the reference. Point the submitter at{" "}
          <Code>/my-tickets</Code> (or build your own status lookup on{" "}
          <Code>POST /api/v1/public/feedback/my-tickets/code</Code> +{" "}
          <Code>POST /api/v1/public/feedback/my-tickets</Code>, the same email/code flow) if they need
          to check on it later.
        </P>
        <H3>Error responses</H3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"><Code>message</Code></th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">404</td>
                <td className="px-3 py-2 text-muted-foreground">This feedback form is not available</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The token is wrong, or the form link was disabled on the project/company.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">422</td>
                <td className="px-3 py-2 text-muted-foreground">Validation failed</td>
                <td className="px-3 py-2 text-muted-foreground">
                  A field is missing, too long, or malformed — see <Code>errors</Code>. Also used for
                  a rejected image (wrong type or over 5&nbsp;MB).
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">429</td>
                <td className="px-3 py-2 text-muted-foreground">Too many submissions — please try again later</td>
                <td className="px-3 py-2 text-muted-foreground">
                  More than 20 submissions from the same IP in an hour.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">500</td>
                <td className="px-3 py-2 text-muted-foreground">Internal server error</td>
                <td className="px-3 py-2 text-muted-foreground">Unexpected failure.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <H3>List your tickets</H3>
        <P><Code>GET /api/v1/public/feedback/&lt;token&gt;/tickets</Code></P>
        <P>
          For your own dashboard to show everything raised against this token — same
          token as above, no separate login. Paginated, newest first.
        </P>
        <CodeBlock>{`curl "https://<your-domain>/api/v1/public/feedback/fd6afc72-537c-4335-b24b-e34d97dc88cb/tickets?page=1&limit=20"`}</CodeBlock>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Query param</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">page</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">integer, optional</td>
                <td className="px-3 py-2 text-muted-foreground">1-indexed. Default <Code>1</Code>.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">limit</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">integer, optional</td>
                <td className="px-3 py-2 text-muted-foreground">Default <Code>20</Code>, max <Code>100</Code>.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">type</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">string, optional</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Filter to one of <Code>feature_request</Code>, <Code>bug</Code>, <Code>complaint</Code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock>{`{
  "success": true,
  "message": "Tickets fetched",
  "statusCode": 200,
  "data": [
    {
      "id": "e3f4a5b6-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
      "ticketCode": "TKT-20260915-007",
      "type": "complaint",
      "title": "Invoice totals look wrong",
      "description": "The tax line doesn't match what's on the PDF export.",
      "suiteName": null,
      "submitterName": "Jamie Ops",
      "submitterEmail": "jamie@acme.com",
      "submitterPhone": "+2348012345678",
      "status": "in_progress",
      "attachments": [
        { "id": "att-1", "url": "https://res.cloudinary.com/.../screenshot-1.png" }
      ],
      "rating": null,
      "createdAt": "2026-09-15T09:12:00.000Z",
      "updatedAt": "2026-09-15T10:00:00.000Z"
    }
  ],
  "errors": [],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}`}</CodeBlock>
        <P>
          <Code>status</Code> is collapsed to <Code>received</Code> / <Code>in_progress</Code> /{" "}
          <Code>resolved</Code> — the same simplified view your end users get on TestMate's own "My
          tickets" page. Internal triage detail (acknowledged/assigned/investigating/escalated/etc.)
          is deliberately hidden here too.
        </P>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"><Code>message</Code></th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">404</td>
                <td className="px-3 py-2 text-muted-foreground">This feedback form is not available</td>
                <td className="px-3 py-2 text-muted-foreground">
                  The token is wrong, or the form link was disabled.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">422</td>
                <td className="px-3 py-2 text-muted-foreground">Validation failed</td>
                <td className="px-3 py-2 text-muted-foreground">Bad <Code>page</Code>, <Code>limit</Code>, or <Code>type</Code>.</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">429</td>
                <td className="px-3 py-2 text-muted-foreground">Too many requests — please try again shortly</td>
                <td className="px-3 py-2 text-muted-foreground">
                  More than 60 requests from the same IP in 15 minutes.
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 font-medium">500</td>
                <td className="px-3 py-2 text-muted-foreground">Internal server error</td>
                <td className="px-3 py-2 text-muted-foreground">Unexpected failure.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <H3>Cross-origin calls</H3>
        <P>
          Unlike the rest of TestMate's API, everything under{" "}
          <Code>/api/v1/public/feedback/*</Code> sends permissive CORS headers — call it directly
          from your own frontend's JavaScript, from whatever domain your product runs on, no server
          proxy required. It's safe to open up because the token is already meant to be shared in a
          plain URL, these routes never use cookies, and submission is separately rate-limited above.
        </P>
        <H3>Security notes</H3>
        <UL>
          <li>Treat the <Code>feedbackToken</Code> the same way you'd treat the hosted link — anyone who has it can submit tickets under that project or company, <Strong>and read every ticket raised against it</Strong> (names, emails, phone numbers, descriptions). Don't log it in a place a browser extension or third-party script could scrape it from, and rotate it (via a TestMate admin) if it ever leaks.</li>
          <li>There's no per-submitter identity check beyond the email they type in — <Code>submitterEmail</Code> is trusted as given, the same as the hosted form.</li>
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
    summary: "Profile, security, notifications, AI, roles, guided tours, and theme.",
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
          <li>
            <Strong>Notifications</Strong> — turn the <Strong>alert sound</Strong> on or off. It
            plays when a new notification or support chat message arrives; the setting follows your
            account, not the browser. Below it, choose per area — projects, test cases and runs, bugs,
            feature requests, feedback, mentions, the IT support queue, live and support chat, and IT
            requests — whether you get an <Strong>in-app</Strong> notification, an{" "}
            <Strong>email</Strong>, both or neither. You only see the areas you take part in, and
            sign-in, password and invitation emails are always sent.
          </li>
          <li>
            <Strong>AI</Strong> — whether AI is set up for you and which key and model it uses; your
            own AI key (if allowed); your AI credits. Administrators also manage the organisation’s
            keys, the model for each feature, credit prices and a usage report. See{" "}
            <a href="#ai-assistant" className="font-medium text-primary hover:underline">AI assistance</a>.
          </li>
          <li>
            <Strong>Roles &amp; access</Strong> (administrators) — the built-in and custom roles and
            exactly which permissions each holds. See{" "}
            <a href="#roles" className="font-medium text-primary hover:underline">Roles &amp; permissions</a>.
          </li>
        </UL>
        <P>
          The <Strong>theme toggle</Strong> in the top-right corner of the app (and of this page)
          switches between light, dark, and system themes. Notifications arrive under the{" "}
          <Strong>bell icon</Strong> in the header, and the floating <Strong>support chat</Strong>{" "}
          button lets you message the TestMate team without leaving the app.
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
          <H3>Someone raised a ticket and wants to check on it — do they need an account?</H3>
          <P>
            No. Point them at <Code>/my-tickets</Code>: they enter the email they submitted with,
            get a 6-digit code by email, and can then see every ticket they’ve raised and reply in
            the conversation.
          </P>
        </div>
        <div>
          <H3>A customer’s tickets aren’t showing up in my project. Why?</H3>
          <P>
            If they submitted through a <Strong>client company’s</Strong> form link, their tickets
            go to that company’s own IT support queue first. You only see them once that team
            escalates. See{" "}
            <a href="#client-companies" className="font-medium text-primary hover:underline">
              Client companies &amp; IT support
            </a>.
          </P>
        </div>
        <div>
          <H3>Should I use live chat or the ticket form?</H3>
          <P>
            Live chat suits quick, conversational questions from visitors on your own site and
            leaves no lifecycle behind. The ticket form suits anything that needs tracking to a
            resolution — it gets a code, a status, and email updates. See{" "}
            <a href="#live-chat" className="font-medium text-primary hover:underline">
              Live chat widget
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
        <div>
          <H3>Does the AI submit anything for me?</H3>
          <P>
            No. It fills in a form (or suggests the right IT request) and you decide what to keep.
            AI triage on an IT request is advice to the approver — it can’t approve, reject or
            change anything.
          </P>
        </div>
        <div>
          <H3>Who pays for AI?</H3>
          <P>
            Your organisation brings its own key from an AI provider and is billed by that provider.
            Administrators can price AI features in credits so usage stays fair; people with their
            own key use it at their own cost and spend no credits.
          </P>
        </div>
        <div>
          <H3>I don’t see IT requests in my sidebar.</H3>
          <P>
            Either your organisation hasn’t turned it on yet, or your role can’t submit IT requests.
            Ask an administrator. See{" "}
            <a href="#it-requests" className="font-medium text-primary hover:underline">IT requests overview</a>.
          </P>
        </div>
        <div>
          <H3>My IT request has been “Pending approval” for days.</H3>
          <P>
            Open it to see which step it’s on and who it’s waiting for. Late approvals escalate
            automatically, and if your approver is away their stand-in can decide it.
          </P>
        </div>
        <div>
          <H3>Can a request be approved without anyone looking at it?</H3>
          <P>
            Only if your administrator set up a rule for it and the item allows it — and only for
            low-risk, non-privileged items that need no identity check. Everything else always goes
            to a person.
          </P>
        </div>
      </div>
    ),
  },

  // ── AI assistance ──────────────────────────────────────────────────────────
  {
    id: "ai-assistant",
    title: "AI assistance",
    icon: Sparkles,
    summary: "Drafting bugs, feature requests and IT requests with AI — set-up, examples, and limits.",
    body: (
      <div className="space-y-4">
        <P>
          TestMate’s AI turns what you write in your own words into a properly filled-in form, and
          asks about anything that’s missing. It <Strong>never submits or changes anything on its
          own</Strong>: you read the result, edit it, and press the form’s usual button.
        </P>
        <H3>Where you’ll find it</H3>
        <UL>
          <li><Strong>Bug drafts</Strong> — in the bug form, from a description of what went wrong.</li>
          <li><Strong>Feature request drafts</Strong> — in the feature request form, from a rough idea.</li>
          <li>
            <Strong>IT request suggestions</Strong> — on the IT request portal: describe what you
            need and the AI picks the catalog item and pre-fills its form.
          </li>
          <li>
            <Strong>IT request triage</Strong> — for approvers and IT: a summary, risks to weigh and
            questions worth asking. Advice only.
          </li>
        </UL>

        <H3>Setting it up (administrators)</H3>
        <OL>
          <li>
            Open <Strong>Settings → AI → Organisation AI keys</Strong> and add a key from{" "}
            <Strong>Anthropic</Strong>, <Strong>OpenAI</Strong>, <Strong>Google Gemini</Strong> or{" "}
            <Strong>Ollama</Strong> (for Ollama, also its server address). The key is checked
            before it’s saved and stored encrypted; requests are billed to your account with that
            provider.
          </li>
          <li>Optionally choose a <Strong>model for each feature</Strong> — a faster one for drafts, a stronger one for triage.</li>
          <li>
            Optionally set <Strong>credit prices</Strong> per feature and give people credits. With
            no prices set, AI is simply free to use on the organisation’s key.
          </li>
          <li>Check the <Strong>usage report</Strong> for requests, failures and who’s using it.</li>
        </OL>
        <P>
          People allowed their own key can add one under <Strong>Settings → AI → My own AI key</Strong>
          ; it’s used instead of the organisation’s, billed to them, and never costs credits. Your
          server needs <Code>AI_KEYS_SECRET</Code> set before any key can be saved.
        </P>

        <H3>Using the assistant on a form</H3>
        <OL>
          <li>Open the <Strong>AI assistant</Strong> panel at the top of the bug or feature request form.</li>
          <li>Describe it however it comes to you, then press <Strong>Draft with AI</Strong>.</li>
          <li>
            The form fills in. Fields the AI wrote are marked <Strong>Filled by AI</Strong>; anything
            it inferred rather than read from you is marked{" "}
            <Strong>AI suggestion — please confirm</Strong>.
          </li>
          <li>
            Answer any <Strong>follow-up questions</Strong> and press{" "}
            <Strong>Update the draft with my answers</Strong>. <Strong>Draft again</Strong> starts
            over from your words; <Strong>Restore my original</Strong> puts the form back exactly as
            it was.
          </li>
          <li>Read every field, then report the bug or submit the request as usual.</li>
        </OL>

        <AiExample
          title="Example — a bug report"
          you="When I attach a screenshot to a bug and click submit nothing happens. Chrome on Windows, it started after yesterday's release."
          result={[
            ["Title", "Bug report doesn't submit when a screenshot is attached"],
            ["Steps", "1. Open Report a bug  2. Attach a screenshot  3. Click Submit"],
            ["Expected", "The bug is reported with the screenshot attached"],
            ["Actual", "Nothing happens after clicking Submit"],
            ["Environment", "Chrome on Windows"],
            ["Severity", "Major *"],
            ["Priority", "High *"],
          ]}
          notes={
            <>
              Follow-up questions: <em>“Does it submit without the attachment?”</em>,{" "}
              <em>“What type and size was the screenshot?”</em> The severity comes with the reason
              behind it, so you can disagree with it knowingly.
            </>
          }
        />

        <AiExample
          title="Example — a feature request"
          you="It would be great if we could export test runs to PDF so I can send results to clients."
          result={[
            ["Title", "Export test runs to PDF"],
            ["Problem", "Sharing run results with clients means screenshots or spreadsheets"],
            ["Proposed solution", "An Export to PDF option on a test run, with results case by case"],
            ["Justification", "Client-ready reports without manual work *"],
            ["Acceptance criteria", "A completed run can be exported to a PDF listing every case and its result *"],
          ]}
          notes={<>Follow-up question: <em>“Should the PDF include failure notes and attachments?”</em></>}
        />

        <H3>What the AI sees, and what’s kept</H3>
        <UL>
          <li>
            Only what you typed, what’s already in the form, and background from the project (its
            description, the suite or test case you picked, and similar earlier tickets). The panel
            names the provider your text goes to before you send it.
          </li>
          <li>
            Text from people is treated as material, never as instructions — writing “ignore your
            rules” into a bug doesn’t change what the AI does.
          </li>
          <li>
            TestMate records that a request happened (feature, model, time, success, tokens) for the
            usage report — not the words you wrote or the reply.
          </li>
        </UL>

        <H3>If it doesn’t work</H3>
        <UL>
          <li><Strong>“AI isn’t set up yet”</Strong> — no key has been added. Use the <Strong>Set up AI to get suggestions</Strong> link, or ask an administrator.</li>
          <li><Strong>Not enough credits</Strong> — your balance doesn’t cover the feature’s price. An administrator can give you more.</li>
          <li><Strong>Too many requests</Strong> — there’s a limit of about 30 AI requests per person every 15 minutes.</li>
          <li>Whatever happens, the form still works by hand — the AI is a shortcut, never a requirement.</li>
        </UL>
      </div>
    ),
  },

  // ── IT requests ────────────────────────────────────────────────────────────
  {
    id: "it-requests",
    title: "IT requests overview",
    icon: Store,
    summary: "What IT requests are, turning them on, and who does what.",
    body: (
      <div className="space-y-4">
        <P>
          <Strong>IT requests</Strong> is where employees ask IT for what they need — a software
          licence, a laptop, a new starter’s accounts, a password reset, cloud resources, an access
          card. Each request follows one route: <Strong>ask → approve → fulfil</Strong>, with
          everyone notified at each step and every step recorded.
        </P>
        <P>
          It’s a module of its own. It shares sign-in, your <Strong>Team</Strong>, roles, notifications
          and the activity log with testing, but has its own <Strong>IT requests</Strong> group in the
          sidebar: <Strong>Request something</Strong>, <Strong>My requests</Strong>,{" "}
          <Strong>Approvals</Strong>, <Strong>IT queue</Strong>, <Strong>Reports</Strong> and{" "}
          <Strong>Catalog setup</Strong> — each shown only to the people who can use it.
        </P>
        <H3>Turning it on</H3>
        <OL>
          <li>An administrator opens <Strong>IT requests → Catalog setup</Strong>. Eight starter categories with an example item each are created for you.</li>
          <li>Adjust the catalog, approvers and service levels (see <a href="#it-requests-setup" className="font-medium text-primary hover:underline">Setting up IT requests</a>).</li>
          <li>Press <Strong>Turn on</Strong>. Until then, only people who set it up can see it.</li>
        </OL>
        <H3>Who does what</H3>
        <UL>
          <li><Strong>Anyone who can request</Strong> (Employees, and testers and leads too) — asks, follows their requests, answers questions.</li>
          <li><Strong>Approvers</Strong> — anyone a catalog item or approval policy names. Approving isn’t a role: you approve because the item asks you to.</li>
          <li><Strong>IT service agents</Strong> — work the queue and fulfil requests.</li>
          <li><Strong>Administrators</Strong> — set up the catalog, approvals, service levels and automation.</li>
        </UL>
        <H3>A request’s life</H3>
        <P>
          <Chip className={chipSlate}>Draft</Chip> → <Chip className={chipBlue}>Submitted</Chip>{" "}
          (or <Chip className={chipAmber}>Pending approval</Chip> → <Chip className={chipViolet}>Approved</Chip>) →{" "}
          <Chip className={chipBlue}>In progress</Chip> → <Chip className={chipGreen}>Fulfilled</Chip>. Along the way it can be{" "}
          <Chip className={chipAmber}>Waiting for information</Chip> (paused for an answer from you),{" "}
          <Chip className={chipRed}>Rejected</Chip> by an approver, or <Chip className={chipZinc}>Cancelled</Chip>.
          Every request gets a reference like <Code>SR-000123</Code>.
        </P>
        <Note>
          Nothing reaches IT before it’s approved, nobody approves their own request, and no
          automation or AI can skip a required approval.
        </Note>
      </div>
    ),
  },
  {
    id: "it-requests-asking",
    title: "Asking IT for something",
    icon: ClipboardList,
    summary: "The request portal, AI suggestions, forms, files, self-service, and following up.",
    body: (
      <div className="space-y-4">
        <H3>Find what you need</H3>
        <P>
          <Strong>Request something</Strong> shows the catalog as tiles. Pick a category, then an
          item — or search (“laptop”, “Adobe”, “VPN”). Items marked <Strong>Needs approval</Strong>{" "}
          go to an approver before IT starts.
        </P>
        <H3>Or just describe it</H3>
        <P>
          If you have AI assistance, the portal shows <Strong>Not sure where to start?</Strong> Write
          what you need, press <Strong>Suggest a request</Strong>, and then{" "}
          <Strong>Continue with this</Strong> to open the right form, already filled in from your
          words. Don’t worry about typos or rough English: the AI corrects spelling and grammar in
          the title, the details and your text answers, keeping what you meant and never adding
          anything you didn’t say. The suggestion shows <Strong>Your request, in clear wording</Strong>,
          and you can still change anything on the form before you submit.
        </P>
        <AiExample
          title="Example — describing what you need"
          you="I'm starting on the design team next Monday and need Figma and Adobe Illustrator on my laptop."
          result={[
            ["Catalog item", "Software access → Software licence or access"],
            ["Title", "Figma and Illustrator for the design team"],
            ["Which software?", "Figma, Adobe Illustrator"],
            ["Needed by", "next Monday’s date *"],
            ["Priority", "Medium"],
          ]}
          notes={
            <>
              Also asked: <em>“Standard user or Administrator access?”</em> — the AI fills in only
              what you said and leaves the rest for you. A banner on the form reminds you to check
              every answer.
            </>
          }
        />
        <H3>Fill in the form</H3>
        <UL>
          <li>Each item asks its own questions; the ones marked <Strong>*</Strong> are needed to submit.</li>
          <li>
            <Strong>Who is this for?</Strong> — yourself, a colleague, or <Strong>a new starter</Strong>{" "}
            who has no account yet (name, and email if known).
          </li>
          <li><Strong>Business justification</Strong> is what your approver reads — say why.</li>
          <li><Strong>Attach files</Strong>: screenshots, quotes, signed forms — images, PDF, Word or Excel, up to 10 files of 10 MB.</li>
          <li><Strong>Save draft</Strong> keeps it to yourself; <Strong>Submit</Strong> sends it.</li>
        </UL>
        <H3>Self-service</H3>
        <P>
          Some items — a password reset, for example — show a <Strong>You can do this yourself</Strong>{" "}
          card with a link to a self-service page. Using it is recorded as done; if it doesn’t sort
          things out, <Strong>I still need IT</Strong> opens the normal form.
        </P>
        <H3>Follow it</H3>
        <UL>
          <li><Strong>My requests</Strong> — In progress, Drafts and Closed, including requests a colleague raised for you.</li>
          <li>The request page shows its approval steps, who has it, the due date, files, the conversation and full history.</li>
          <li>
            You’re told as it moves: when an approval step finishes and the next begins, when one of
            several required approvals is given (“2 more approvals are needed”), and when it’s
            finally approved or rejected. Mute these with <Strong>Settings → Notifications → Request updates</Strong>.
          </li>
          <li>
            If a request is paused with <Strong>Waiting for information</Strong>, it shows the
            question and an answer box. It’s on hold until you answer — then it carries on exactly
            where it was. Everyday questions happen in the Conversation and don’t pause anything.
          </li>
          <li>You can cancel it any time before IT starts work.</li>
        </UL>
        <H3>The conversation</H3>
        <P>
          Everyone on a request — the requester, the person it’s for, approvers and IT — talks in
          one place, the <Strong>Conversation</Strong> on the request page. New messages appear as
          they’re sent, without a reload.
        </P>
        <UL>
          <li><Strong>Reply</Strong> — press <Strong>Reply</Strong> under a message to answer it. Replies sit indented under the message they answer; replying to a reply keeps them together under the same one.</li>
          <li><Strong>@mention</Strong> — type <Code>@</Code> and pick a name to tell someone a message is for them. They get a notification. You can only mention people who can read the message, and you can’t mention yourself.</li>
          <li><Strong>Files</Strong> — <Strong>Attach files</Strong> adds up to 5 images, PDF, Word or Excel files (10 MB each) to a message. A message can be just files.</li>
          <li><Strong>Edit</Strong> — you can edit your own messages. They show “(edited)”, and anyone you newly mention is told.</li>
          <li>
            <Strong>Delete</Strong> — you can delete your own messages, and people who manage IT
            requests can delete anyone’s. A deleted message stays in the thread as “This message
            was deleted” so replies still make sense; its text and files are removed for good.
          </li>
        </UL>
        <Note>
          <Strong>Internal notes</Strong> are for IT only. The requester, the person it’s for and
          approvers can’t see them or their files, and aren’t told about them. A reply to an
          internal note is internal too, and only IT can be mentioned in one.
        </Note>
      </div>
    ),
  },
  {
    id: "it-requests-approvals",
    title: "Approving IT requests",
    icon: ListChecks,
    summary: "Deciding requests, approval steps and authority, stand-ins, and AI triage.",
    body: (
      <div className="space-y-4">
        <P>
          When a request needs you, you get a notification and an email, and it appears under{" "}
          <Strong>Approvals → Waiting for me</Strong>. Open it and choose <Strong>Approve</Strong>{" "}
          (a comment is optional) or <Strong>Reject</Strong> (a reason is required). If you need
          to know something first, ask the requester in the <Strong>Conversation</Strong> on the
          request page.
        </P>
        <H3>Steps</H3>
        <P>
          A request can need one approval or several steps in a row — for example the requester’s{" "}
          <Strong>line manager</Strong>, then <Strong>Finance</Strong>. Each step is set to one of three
          modes:
        </P>
        <UL>
          <li>
            <Strong>Any one approves</Strong> — the step is done as soon as one of the people or
            groups listed approves. The others aren’t needed.
          </li>
          <li>
            <Strong>Each one approves</Strong> — every person, group and line manager listed must
            approve, all asked at the same time and in any order. A group counts as soon as one of
            its members does, so “Finance and Security” means one from Finance <em>and</em> one from
            Security.
          </li>
          <li>
            <Strong>One after another</Strong> — the same people must all approve, but only the first
            is asked; each approval then opens the next, in the order the approvers are listed. Nobody
            can approve out of turn, and the next person is told when it’s theirs. Use the arrows on an
            approver in the policy editor to change the order.
          </li>
        </UL>
        <P>
          Later steps show as “Not started” until the one before is done; any rejection ends the
          request. If you need one person to approve before another, use{" "}
          <Strong>One after another</Strong> (or give each person a step of their own).
        </P>
        <H3>Authority</H3>
        <P>
          Each request carries the risk of the item it’s for (low to critical). An approver group can
          only decide up to its own level — Finance “up to Medium” can’t approve a high-risk cloud
          request, and that step goes to an IT request administrator instead.
        </P>
        <H3>Away? Set a stand-in</H3>
        <P>
          On the Approvals page, <Strong>Set a stand-in</Strong> names a colleague and dates. While
          you’re away, new approvals go to them and they can decide the ones already waiting for you;
          the record shows who actually decided. <Strong>I’m back</Strong> ends it early.
        </P>
        <H3>AI triage</H3>
        <P>
          Approvers and IT can press <Strong>Get AI triage</Strong> on a request for a second pair of
          eyes. It’s saved on the request so the next approver sees it too, and it’s{" "}
          <Strong>advice only</Strong> — it never approves, rejects or changes anything.
        </P>
        <AiExample
          title="Example — triage of SR-000214, “Production database access”"
          you="(No typing — the AI reads the request: item Business application, risk High, role ‘Administrator’, justification ‘Need to fix the reporting job’, and how similar requests went.)"
          result={[
            ["Summary", "Asks for administrator access to the production reporting database to fix a failing job."],
            ["Suggestion", "Suggests asking for more information"],
            ["Worth weighing", "Administrator rights on production; no end date given"],
            ["Could ask", "How long is access needed? Would read-only access be enough?"],
          ]}
          notes={<>The suggestion explains itself, e.g. “Similar requests were approved for a fixed period.” You still decide.</>}
        />
      </div>
    ),
  },
  {
    id: "it-requests-queue",
    title: "Working the IT queue",
    icon: Inbox,
    summary: "For IT agents: picking up, identity checks, fulfilling, and automation.",
    body: (
      <div className="space-y-4">
        <P>The <Strong>IT queue</Strong> has a tab for each kind of work:</P>
        <UL>
          <li><Strong>Ready</Strong> — approved (or needing no approval) and waiting to be picked up.</li>
          <li><Strong>In progress</Strong>, <Strong>Needs review</Strong>, <Strong>Overdue</Strong>, <Strong>Awaiting approval</Strong>, <Strong>Waiting on requester</Strong> and <Strong>Closed</Strong>.</li>
          <li>Filter by who has it, and search by title or number (<Code>SR-000123</Code>, <Code>sr-123</Code> or <Code>123</Code>).</li>
        </UL>
        <H3>Doing the work</H3>
        <OL>
          <li><Strong>Take it</Strong> (or assign it to a colleague), then <Strong>Start work</Strong> — the requester is told.</li>
          <li>Read <Strong>How IT fulfils this</Strong> (your team’s own notes for the item) and talk to the requester in the conversation; tick <Strong>Internal note</Strong> for things only IT should see.</li>
          <li><Strong>Mark fulfilled</Strong> with a note saying what was done — the requester gets it word for word.</li>
          <li>If it can’t be done, <Strong>Cancel request</Strong> with a reason.</li>
        </OL>
        <H3>Identity checks</H3>
        <P>
          Items like password resets require an <Strong>identity check</Strong>: before you can start,
          record how you confirmed who’s asking (for example, a call-back to their known number) on
          the <Strong>Identity check</Strong> card. The requester never sees your note. Never send a
          new password in the request.
        </P>
        <H3>Flags and automation</H3>
        <UL>
          <li>
            <Strong>Needs review</Strong> — a rule flagged it (you see why) or automation failed. Look
            into it, then <Strong>Mark as reviewed</Strong>.
          </li>
          <li>
            Items fulfilled by a <Strong>connector</Strong> show an <Strong>Automation</Strong> card:
            what ran, when, and the outcome. If it failed, choose <Strong>Retry</Strong> or{" "}
            <Strong>Handle it manually</Strong> (automation stops and it’s yours).
          </li>
          <li>Late requests escalate on their own — to you first, then to your escalation contacts.</li>
          <li>
            <Strong>New IT request</Strong> alerts go to the IT team: people with the IT service agent
            role, or a custom role that can work the queue. Administrators can work the queue too but
            aren’t pinged about every request — unless there’s no IT team yet, in which case they are.
            Anyone can switch these alerts off under <Strong>Settings → Notifications → New IT requests</Strong>.
          </li>
        </UL>
        <H3>The date they need it by</H3>
        <P>
          When the requester answers <Strong>Needed by</Strong>, the IT queue and Approvals show a{" "}
          <Strong>Needed by 10 Nov</Strong> badge, and the request page shows the date next to the{" "}
          <Strong>Fulfilment target</Strong>. It doesn’t change the target or the priority — it tells
          you when the request is in danger of missing their date:
        </P>
        <DocTable
          rows={[
            ["Badge", "What it means"],
            ["Grey", "Nothing to worry about yet."],
            ["Amber — target is later", "The service-level target is after their date, so finishing on target would still be late. Pick it up early, or agree a new date in the conversation."],
            ["Amber — within two days", "Their date is less than two days away."],
            ["Red — date passed", "Their date has gone and it isn’t done."],
          ]}
        />
        <Note>
          Hover the badge to see which warning it is. Drafts and finished requests show the date
          without a warning. The badge reads the date question whose key is <Code>needed_by</Code> —
          the starter items have one, and a date question you label “Needed by” gets that key.
        </Note>
      </div>
    ),
  },
  {
    id: "it-requests-setup",
    title: "Setting up IT requests",
    icon: Settings2,
    summary: "Catalog and forms, approval policies, groups, line managers, service levels.",
    body: (
      <div className="space-y-4">
        <P>Everything lives in <Strong>IT requests → Catalog setup</Strong> (administrators).</P>
        <H3>Catalog and forms</H3>
        <UL>
          <li><Strong>Categories</Strong> are the portal’s tiles; <Strong>items</Strong> are the things people can ask for.</li>
          <li>
            Each item has its own <Strong>form</Strong>: short or long text, number, date, pick one,
            pick several, tick box — with help text and required questions. <Strong>Preview</Strong>{" "}
            shows it exactly as people will see it.
          </li>
          <li>
            <Strong>Hide</Strong> takes something off the portal and keeps its history.{" "}
            <Strong>Delete</Strong> only works for things nobody has ever requested — otherwise hide them.
          </li>
          <li>Requests already submitted keep the form and approvers they were raised with.</li>
        </UL>
        <P>
          Every setting on an item — answer keys, how it’s fulfilled, risk, and the three safety ticks —
          is explained one by one in{" "}
          <a href="#it-requests-items" className="font-medium text-primary hover:underline">Catalog item settings explained</a>.
        </P>
        <H3>Who approves</H3>
        <UL>
          <li><Strong>No approval</Strong>, <Strong>one step — any of these people</Strong>, or <Strong>an approval policy</Strong>.</li>
          <li><Strong>Approval policies</Strong> — reusable routes of steps, each “any one approves”, “each one approves” or “one after another”, naming people, groups, or the requester’s line manager.</li>
          <li><Strong>Approver groups</Strong> — e.g. Finance, Security — each with the highest risk it may approve.</li>
          <li>
            <Strong>Line managers</Strong> — who reports to whom (no loops allowed). If a request
            needs someone’s line manager and they don’t have one, it can’t be submitted: the form
            says so before it’s filled in, and the person is asked to have an IT request
            administrator set it first. A draft can still be saved. The switch{" "}
            <Strong>Require a line manager to submit</Strong> (on by default) controls this; turn it
            off and an IT request administrator approves in their place instead.
          </li>
          <li>
            <Strong>IT agents can’t approve requests</Strong> (a switch at the top of{" "}
            <Strong>Approval policies</Strong>, on by default) — whoever fulfils a request can’t also approve it.
            It covers anyone who can work the IT queue but can’t set up IT requests; administrators
            and IT leads still can. Agents can’t be picked as approvers and are skipped on new
            requests, so the next approver or the stand-in is asked instead.
          </li>
          <li>Each item has a <Strong>risk</Strong> and can be marked <Strong>privileged access</Strong> (never approved automatically).</li>
          <li>If nobody named can decide, IT request administrators do — a request never skips approval.</li>
        </UL>
        <H3>Service levels and escalation</H3>
        <P>
          Set hours for each approval step and hours to fulfil by priority (items can override). Late
          requests escalate in three steps, measured against the target:
        </P>
        <CodeBlock>{`Target 24 hours, escalation at 50% and 100%:
  at 24h  → reminder to whoever is holding it up
  at 36h  → also your escalation contacts
  at 48h  → again, marked critical
Time spent waiting for the requester doesn't count.`}</CodeBlock>
      </div>
    ),
  },
  {
    id: "it-requests-items",
    title: "Catalog item settings explained",
    icon: ListChecks,
    summary: "Every setting on an item in plain words: answer keys, fulfilment, risk, safety ticks.",
    body: (
      <div className="space-y-4">
        <P>
          A catalog item’s settings answer three questions: <Strong>what do we ask?</Strong> (the
          form), <Strong>who says yes?</Strong> (approval and risk), and <Strong>who does the work,
          and under what safety rules?</Strong> (fulfilment and the three ticks). Open an item with{" "}
          <Strong>Catalog setup → Edit</Strong> to see them all.
        </P>

        <H3>Questions and their answer keys</H3>
        <P>
          Each question has a small grey box next to its help text: its <Strong>answer key</Strong>.
          It’s the internal name the answer is saved under — for the question “Access level”, the
          answer is stored as <Code>access_level: "Standard user"</Code>. People filling in the form
          never see it.
        </P>
        <UL>
          <li><Strong>Automation rules</Strong> use it: “when <Code>access_level</Code> is Administrator → flag for review”.</li>
          <li><Strong>Connectors</Strong> receive answers by key: <Code>{`"answers": { "access_level": "Administrator" }`}</Code>.</li>
          <li><Strong>AI</Strong> fills answers in by key when it pre-fills a form.</li>
        </UL>
        <P>
          You never type it. A new question’s key is made from its text as you type (“Needed by” →{" "}
          <Code>needed_by</Code>; a second “Needed by” → <Code>needed_by_2</Code>) and it’s{" "}
          <Strong>fixed once you save</Strong>. After that you can reword the question as often as you
          like — rules and connectors keep working because the key never changes.
        </P>
        <P>
          One key means something to IT requests itself: a date question with the key{" "}
          <Code>needed_by</Code> is the date the requester needs it by. IT and approvers see it as a
          badge that turns amber or red when the request might miss it (see{" "}
          <Strong>Working the IT queue</Strong>). It never changes the service-level target.
        </P>

        <H3>How it’s fulfilled — who does the work</H3>
        <DocTable
          rows={[
            ["Choice", "What happens after it’s approved", "Use it for"],
            [
              <Strong key="a">By a person in IT</Strong>,
              "It lands in the IT queue; an agent does the work by hand and marks it fulfilled with a note.",
              "Most things — the default.",
            ],
            [
              <Strong key="b">Automatically, by a connector</Strong>,
              "TestMate sends it to your automation tool (e.g. Power Automate), which does the work in the other system and reports back. If it fails, IT is told and can retry or do it by hand.",
              "Routine jobs IT does the same way every time — adding someone to a licence group, creating a mailbox.",
            ],
            [
              <Strong key="c">By the requester, through a self-service link</Strong>,
              "The item shows a link to a page where people can do it themselves. Using it is recorded as done through self-service — nothing for IT to do.",
              "Things people can do faster on their own — password resets on Microsoft, Google or Okta.",
            ],
          ]}
        />
        <P>
          For a <Strong>self-service link</Strong> you fill in two boxes: the{" "}
          <Strong>link</Strong> (must start with <Code>https://</Code>, e.g.{" "}
          <Code>https://passwordreset.microsoftonline.com</Code>) and the <Strong>button text</Strong>{" "}
          people click (e.g. “Reset my password”). For a <Strong>connector</Strong> you pick one from
          the list — see{" "}
          <a href="#it-requests-automation" className="font-medium text-primary hover:underline">IT request automation</a>{" "}
          for setting connectors up.
        </P>

        <H3>What employees see with a self-service link</H3>
        <Mock label="The top of the item’s page on the request portal">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-background p-3 dark:border-emerald-900">
            <div className="text-sm">
              <p className="font-medium text-foreground">You can do this yourself — usually faster</p>
              <p className="text-muted-foreground">Use the self-service page. If it doesn’t sort things out, ask IT below.</p>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Reset my password ↗</span>
              <span className="rounded-md border px-3 py-1.5 text-foreground">I still need IT</span>
            </div>
          </div>
        </Mock>
        <UL>
          <li>
            <Strong>Reset my password</Strong> opens the page in a new tab, and TestMate records a
            request as <Chip className={chipGreen}>Fulfilled</Chip> by self-service — it counts in
            Reports, and IT never has to touch it.
          </li>
          <li>
            <Strong>I still need IT</Strong> reveals the normal form, and the request goes to IT as
            usual — for when the self-service page doesn’t help (say, the person is locked out of it too).
          </li>
        </UL>

        <H3>Risk</H3>
        <P>
          Each item has a risk — <Chip className={chipSlate}>Low</Chip>{" "}
          <Chip className={chipBlue}>Medium</Chip> <Chip className={chipAmber}>High</Chip>{" "}
          <Chip className={chipRed}>Critical</Chip> — copied onto every request for it. It decides two
          things: which <Strong>approver groups</Strong> may approve it (a group set to “up to Medium”
          can’t approve a High-risk request), and whether it could ever be approved automatically
          (only Low risk can).
        </P>

        <H3>The three safety ticks</H3>
        <DocTable
          rows={[
            ["Tick", "What it means", "Example"],
            [
              <Strong key="a">Requires an identity check</Strong>,
              "Before any work starts, IT must record how they confirmed who is really asking — a call-back to their known number, their manager confirming, photo ID on a video call. The work buttons stay disabled until they do. The requester never sees IT’s note.",
              "Password resets and account unlocks — so nobody can get someone else’s password by pretending to be them.",
            ],
            [
              <Strong key="b">Privileged access</Strong>,
              "Powerful access that must always be approved by a person. Automation can never approve it.",
              "Admin rights on a server, access to production systems or financial data.",
            ],
            [
              <Strong key="c">Automation rules may approve it</Strong>,
              "Allows an automation rule to approve the request with no person involved. On its own it does nothing — a rule must also ask for it.",
              "Cheap, harmless things: a replacement mouse, staff Wi-Fi access.",
            ],
          ]}
        />
        <Note>
          A request is only approved automatically when <Strong>all</Strong> of these hold: a rule
          asks for it, the item allows it, the item is <Strong>Low</Strong> risk, it’s{" "}
          <Strong>not</Strong> privileged access, it needs <Strong>no</Strong> identity check, and no
          rule flagged it for review. Otherwise it goes to its approvers as normal, and the reason is
          recorded on the request. Ticking “Automation rules may approve it” together with either of
          the other two ticks means it will <Strong>never</Strong> be approved automatically — the
          editor warns you.
        </Note>

        <H3>Sensible combinations</H3>
        <DocTable
          rows={[
            ["Item", "Approval", "How it’s fulfilled", "Risk", "Ticks"],
            ["Password reset", "None", "Self-service link (IT as the fallback)", "Low", "Requires an identity check"],
            ["Software licence (Figma)", "Line manager", "Connector, or a person", "Medium", "—"],
            ["Admin rights on a server", "Policy: manager, then Security", "A person", "High", "Privileged access"],
            ["Replacement mouse", "One step (but a rule approves it)", "A person", "Low", "Automation rules may approve it"],
            ["New starter accounts", "Line manager", "Connector", "Medium", "—"],
          ]}
        />

        <H3>Worked example: setting up password resets</H3>
        <OL>
          <li>Open <Strong>Password reset or account unlock</Strong> in Catalog setup (it’s in the starter catalog).</li>
          <li>Approval: <Strong>No approval</Strong>. Risk: <Strong>Low</Strong>.</li>
          <li>
            How it’s fulfilled: <Strong>By the requester, through a self-service link</Strong>; link{" "}
            <Code>https://passwordreset.microsoftonline.com</Code>; button text “Reset my password”.
          </li>
          <li>Keep <Strong>Requires an identity check</Strong> ticked — it protects the people who still need IT.</li>
          <li>
            In <Strong>How IT fulfils this</Strong>, note your team’s steps, e.g. “Call back on the number in HR
            records before resetting. Never send the new password by email.”
          </li>
          <li>Save. Most people now reset their own password in seconds; the rest reach IT, who confirm who they are first.</li>
        </OL>

        <H3>The other settings, briefly</H3>
        <UL>
          <li><Strong>Service levels (optional)</Strong> — hours per approval step and hours to fulfil for this item, instead of the organisation’s defaults.</li>
          <li><Strong>How IT fulfils this (IT only)</Strong> — your team’s own instructions, shown to agents on every request for the item.</li>
          <li><Strong>Show on the request portal</Strong> — untick to hide the item without losing anything.</li>
        </UL>
      </div>
    ),
  },
  {
    id: "it-requests-automation",
    title: "IT request automation",
    icon: Bot,
    summary: "Rules, automatic approval, connectors (Power Automate…), self-service, the run log.",
    body: (
      <div className="space-y-4">
        <P>
          <Strong>Catalog setup → Automation</Strong> (for people allowed to set up automation) lets
          routine work run itself. The principle: <Strong>rules decide, AI advises, and nothing skips
          a required approval</Strong>. Every automated step is written to the{" "}
          <Strong>Run log</Strong> and to the request itself.
        </P>
        <H3>Rules</H3>
        <P>
          A rule says “when a request looks like this, do that”. Rules run once, when a request is
          submitted, in order; every matching rule applies. <Strong>Try it on the last 50
          requests</Strong> shows what a rule would have matched before you switch it on.
        </P>
        <UL>
          <li>
            <Strong>Example — production needs a look:</Strong> when the category is Cloud resources
            and Environment is “Production” → set priority High, and flag for review with “Production
            resources need a platform-team check”.
          </li>
          <li>
            <Strong>Example — new starters:</Strong> when it’s for a new starter → assign to Jane,
            and add the internal note “Order the laptop five working days ahead”.
          </li>
          <li>
            <Strong>Example — straight through:</Strong> when the item is Access card → approve
            automatically.
          </li>
        </UL>
        <H3>Automatic approval</H3>
        <P>It only happens when <Strong>all</Strong> of these hold — otherwise the request goes to its approvers and the reason is recorded:</P>
        <UL>
          <li>a rule asks for it, and the item allows it (<Strong>Automation rules may approve it</Strong>);</li>
          <li>the item is <Strong>low risk</Strong>, not <Strong>privileged access</Strong>, and needs no identity check;</li>
          <li>no rule flagged the request for review.</li>
        </UL>
        <H3>Connectors</H3>
        <P>
          A connector lets an automation tool you already use — Power Automate, Zapier, n8n, Make —
          do the work for approved requests: assign the licence, add someone to a group, create the
          account. Point an item at it under{" "}
          <Strong>How it’s fulfilled → Automatically, by a connector</Strong>. If the tool fails,
          the request comes back to IT to finish by hand. TestMate never holds passwords or keys for
          the systems the connector changes.
        </P>
        <Note>
          The full explanation, the exact data TestMate sends, and step-by-step setup for each tool
          are in{" "}
          <a href="#it-requests-connectors" className="font-medium text-primary hover:underline">Connectors: the setup manual</a>.
        </Note>
        <H3>Self-service links</H3>
        <P>
          An item can instead point people to a self-service page (<Strong>By the requester, through a
          self-service link</Strong>) — for example your identity provider’s password-reset page.
          It’s shown before the form, and using it counts as fulfilled by self-service.
        </P>
      </div>
    ),
  },
  {
    id: "it-requests-connectors",
    title: "Connectors: the setup manual",
    icon: Webhook,
    summary: "What a connector is in plain words, and how to set one up in Power Automate, Zapier, n8n, Make and more.",
    body: (
      <div className="space-y-4">
        <H3>In plain words</H3>
        <P>
          Say Emma asks for an Adobe licence. Without a connector, once it’s approved someone in IT
          opens the Adobe admin site, assigns her a licence by hand, comes back to TestMate and
          presses <Strong>Mark fulfilled</Strong>. Many requests are the same few clicks every time.
        </P>
        <P>
          A connector is a <Strong>phone number TestMate calls when a request is approved</Strong>,
          so a robot does those clicks instead. The robot isn’t part of TestMate — it’s a flow your
          IT team builds once in an automation tool such as Power Automate, Zapier, n8n or Make
          (“when TestMate sends a request, assign an Adobe licence to that person”). The connector
          is just TestMate’s saved record of how to reach that flow: its web address and a secret.
        </P>
        <CodeBlock>{`Emma asks for Adobe  →  Mary approves
                              │
                              ▼
   TestMate calls the connector:
   "Emma (emma@acme.com) needs Adobe Acrobat Pro — SR-000123"
                              │
                              ▼
   Your flow (Power Automate, Zapier…) assigns the licence in Adobe
                              │
                              ▼
   It answers TestMate: "succeeded"
                              │
                              ▼
   TestMate marks SR-000123 Fulfilled and tells Emma`}</CodeBlock>
        <P>
          If the flow answers <Strong>failed</Strong> (the licence pool is full, Adobe is down),
          TestMate flags the request <Strong>Automation failed</Strong> and tells IT, who press{" "}
          <Strong>Handle it manually</Strong> and do it the old way — Emma just sees it done. If the
          flow doesn’t answer at all, TestMate tries again after 1, 5 and 15 minutes, then hands it to IT.
        </P>
        <DocTable
          rows={[
            ["On the screen", "What it means"],
            ["Connector", "Who to call: your flow’s web address."],
            ["Signing secret", "A password on every call, so your flow can tell it really came from TestMate."],
            ["Send a test", "Rings the flow to check the line works. It does no work."],
            ["How it’s fulfilled → By a connector", "Set on a catalog item: “for this kind of request, call the flow instead of waiting for IT”."],
            ["Run log", "The call history: every call TestMate made, and what came back."],
          ]}
        />
        <Note>
          <Strong>TestMate does not build the flow.</Strong> The flow lives in your automation tool,
          built by someone who has admin access to the systems it changes. TestMate only calls it,
          passes on the request, and waits for “succeeded” or “failed”. Connectors are optional:
          without one, requests simply go to the IT queue for a person to do.
        </Note>
        <P>
          <Strong>Why it works this way.</Strong> TestMate doesn’t sign in to Microsoft 365, Adobe or
          Google itself. Your tool does, with its own accounts, and keeps those credentials. So one
          connector works with any tool your company already uses: Power Automate, Zapier, n8n,
          Make, or your own scripts. And TestMate never holds keys to the systems it changes.
        </P>

        <H3>Who does what</H3>
        <DocTable
          rows={[
            ["Step", "Where", "Who"],
            ["Build the flow (e.g. “add this person to the Adobe users group”)", "Your automation tool", "IT admin, once"],
            ["Copy the flow’s web address", "Your automation tool", "IT admin"],
            [<>Create the connector, paste the address, copy the secret, <Strong>Send a test</Strong></>, "TestMate → Catalog setup → Automation → Connectors", "Someone allowed to set up IT-request automation"],
            [<>Set <Strong>How it’s fulfilled → By a connector</Strong> on the items it should handle</>, "TestMate → Catalog setup → the item", "Same"],
            ["Every approved request after that", "Automatic", "Nobody"],
          ]}
        />

        <H3>Five rules every flow must follow</H3>
        <OL>
          <li>
            <Strong>Answer within 10 seconds.</Strong> TestMate waits 10 seconds for a reply, then
            treats the call as lost and retries. If the work takes longer, reply{" "}
            <Code>202</Code> straight away and report the result later on the{" "}
            <Code>callbackUrl</Code> (see “Two ways to answer” below).
          </li>
          <li>
            <Strong>Do nothing on a test.</Strong> <Strong>Send a test</Strong> sends{" "}
            <Code>{`"event": "ping"`}</Code>. Answer it with <Code>200</Code> and stop — only do the
            work when the event is <Code>service_request.fulfil</Code>.
          </li>
          <li>
            <Strong>Don’t do the work twice.</Strong> A retry has the same{" "}
            <Code>deliveryId</Code>. If your flow already handled that id, just answer “succeeded” again.
          </li>
          <li>
            <Strong>Write the note for the person.</Strong> On success, your <Code>note</Code> is
            shown to the requester (“Done automatically: Adobe licence assigned — sign in again to
            use it”). On failure, it’s shown to IT, so say what went wrong and what to do.
          </li>
          <li>
            <Strong>Keep the address secret.</Strong> Anyone with your flow’s address could call it.
            TestMate stores it encrypted and only ever shows its start; check the signature (below)
            where your tool can.
          </li>
        </OL>

        <H3>What TestMate sends</H3>
        <P>
          A <Code>POST</Code> with a JSON body. The work is usually for{" "}
          <Code>request.requestedFor</Code> (someone the requester asked on behalf of) and otherwise
          for <Code>request.requester</Code>. A new starter (<Code>newStarter: true</Code>) has no
          account yet — their email is the one typed on the form.
        </P>
        <CodeBlock>{`POST <your connector address>
Content-Type:         application/json
X-TestMate-Event:     service_request.fulfil      (or "ping" for Send a test)
X-TestMate-Delivery:  8d1c2f0e-…                  (the same on a retry)
X-TestMate-Timestamp: 1760695200                  (unix seconds)
X-TestMate-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>

{
  "event": "service_request.fulfil",
  "deliveryId": "8d1c2f0e-…",
  "attempt": 1,
  "callbackUrl": "https://<your TestMate>/api/v1/public/service-desk/callbacks/8d1c2f0e-…/<token>",
  "request": {
    "id": "5b0e…",
    "reference": "SR-000123",
    "title": "Adobe for contract signing",
    "description": "I sign supplier contracts every week",
    "businessJustification": "Contracts are currently printed and scanned",
    "priority": "high",
    "riskLevel": "low",
    "category": "Software access",
    "categoryKey": "software_access",
    "item": "Software licence or access",
    "itemId": "a71c…",
    "answers": { "software": "Adobe Acrobat Pro", "access_level": "Standard user", "needed_by": "2026-11-01" },
    "answerLabels": { "software": "Which software?", "access_level": "Access level", "needed_by": "Needed by" },
    "requester": { "name": "Emma Stone", "email": "emma@acme.com" },
    "requestedFor": null,
    "submittedAt": "2026-10-17T09:12:00.000Z",
    "approvedAt": "2026-10-17T10:03:00.000Z",
    "autoApproved": false
  }
}`}</CodeBlock>
        <P>
          The keys in <Code>answers</Code> are each question’s <Strong>answer key</Strong> from the
          form builder (see “Catalog item settings explained”). They never change once the question
          is saved, so your flow can rely on them even if the question is reworded.
        </P>
        <P>A test (<Strong>Send a test</Strong>) is much smaller:</P>
        <CodeBlock>{`{ "event": "ping", "deliveryId": "…", "sentAt": "2026-10-17T09:00:00.000Z" }`}</CodeBlock>

        <H3>Two ways to answer</H3>
        <P><Strong>A. Straight away</Strong> — when the work takes a few seconds:</P>
        <CodeBlock>{`HTTP 200
Content-Type: application/json

{ "status": "succeeded", "note": "Adobe Acrobat Pro assigned — sign out and in again to use it" }
  or
{ "status": "failed", "note": "No Acrobat licences left — buy more or free one up" }`}</CodeBlock>
        <P>
          <Strong>B. Later</Strong> — when the work is slow, or your tool always replies on its own
          (Zapier does). Reply with any <Code>2xx</Code> that has no <Code>status</Code> (e.g.{" "}
          <Code>202</Code>), do the work, then send the result to the <Code>callbackUrl</Code>:
        </P>
        <CodeBlock>{`POST <callbackUrl>
Content-Type: application/json

{ "status": "succeeded", "note": "Mailbox created", "externalReference": "CHG0012345" }`}</CodeBlock>
        <UL>
          <li><Code>externalReference</Code> is optional — a ticket or change number in the other system, kept in the Run log.</li>
          <li>The callback address works once, until the run finishes. Sending the same result again is harmless (<Code>{`"recorded": false`}</Code>).</li>
          <li>No result within <Strong>24 hours</Strong> counts as failed.</li>
          <li>
            The callback must reach your TestMate over the internet. That’s always true for TestMate
            in the cloud; on a developer’s laptop it isn’t, so cloud tools can only use way A there.
          </li>
        </UL>
        <DocTable
          rows={[
            ["Your flow answers", "TestMate does"],
            [<><Code>2xx</Code> with <Code>{`"status": "succeeded"`}</Code></>, "Marks the request Fulfilled and tells the requester, with your note."],
            [<><Code>2xx</Code> with <Code>{`"status": "failed"`}</Code></>, "Flags it Automation failed, tells IT, and adds your note for them."],
            [<><Code>2xx</Code> with anything else</>, "Waits for the result on the callbackUrl (up to 24 hours)."],
            [<>No answer in 10 s, <Code>408</Code>, <Code>429</Code> or <Code>5xx</Code></>, "Tries again after 1, 5 and 15 minutes, then fails as above."],
            [<>Any other <Code>4xx</Code> (e.g. 401, 404)</>, "Fails at once — usually a wrong address or a switched-off flow."],
          ]}
        />

        <H3>Checking it really came from TestMate (optional, recommended)</H3>
        <P>
          Every call is signed with the connector’s secret. Your flow joins the{" "}
          <Code>X-TestMate-Timestamp</Code> header, a dot and the <Strong>raw</Strong> body exactly as
          received, makes an HMAC-SHA256 of that with the secret, and compares it with{" "}
          <Code>X-TestMate-Signature</Code>. Reject anything that doesn’t match, or whose timestamp is
          more than 5 minutes old.
        </P>
        <CodeBlock>{`// Node.js
const crypto = require("crypto")
function fromTestMate(headers, rawBody, secret) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(headers["x-testmate-timestamp"] + "." + rawBody)
    .digest("hex")
  const given = String(headers["x-testmate-signature"] || "")
  const fresh = Math.abs(Date.now() / 1000 - Number(headers["x-testmate-timestamp"])) < 300
  return fresh && given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}`}</CodeBlock>
        <P>
          Not every tool can do this (Power Automate has no HMAC function). Where it can’t, the
          long random code in the flow’s own address is what keeps strangers out — so treat the
          address like a password.
        </P>

        <H3>Getting a sample into your tool</H3>
        <P>
          Most tools learn the fields from one example call. <Strong>Send a test</Strong> only sends a
          ping, so send the sample above yourself: save it as <Code>sample.json</Code> (without the
          header lines) and run
        </P>
        <CodeBlock>{`curl -X POST "<your flow's address>" \\
  -H "Content-Type: application/json" \\
  -H "X-TestMate-Event: service_request.fulfil" \\
  --data @sample.json`}</CodeBlock>
        <P>
          Or point a test item at the connector and submit a real request — the flow then gets the
          exact fields of that item’s form.
        </P>

        <H3>Power Automate (Microsoft 365)</H3>
        <P>
          Best when your users and licences are in Microsoft 365 / Entra ID. The HTTP trigger and the
          HTTP action are <Strong>premium</Strong>, so the flow’s owner needs a Power Automate Premium
          (or equivalent) licence.
        </P>
        <OL>
          <li>
            At <Strong>make.powerautomate.com</Strong>, create a cloud flow whose trigger is{" "}
            <Strong>When an HTTP request is received</Strong>. Set <Strong>Who can trigger the
            flow</Strong> to <Strong>Anyone</Strong> (TestMate isn’t a Microsoft user — the secret code
            in the address protects it).
          </li>
          <li>
            In the trigger choose <Strong>Use sample payload to generate schema</Strong> and paste the
            sample body above, so the fields (reference, answers, requester email…) appear as dynamic content.
          </li>
          <li>Save. The trigger now shows the <Strong>HTTP URL</Strong> — copy it.</li>
          <li>
            Add a <Strong>Condition</Strong>: <Code>event</Code> is equal to <Code>ping</Code>. In{" "}
            <Strong>True</Strong>, add a <Strong>Response</Strong> action with status code{" "}
            <Code>200</Code> and then <Strong>Terminate</Strong> (Succeeded).
          </li>
          <li>
            In <Strong>False</Strong>, do the work with Microsoft’s ready-made actions — for example{" "}
            <Strong>Office 365 Users → Get user profile (V2)</Strong> with the requester’s email, then{" "}
            <Strong>Microsoft Entra ID → Add user to group</Strong>. Read an answer with an expression
            like <Code>{`triggerBody()?['request']?['answers']?['software']`}</Code>.
          </li>
          <li>
            Finish with a <Strong>Response</Strong> action: status <Code>200</Code>, body{" "}
            <Code>{`{"status":"succeeded","note":"Added to Adobe users"}`}</Code>. Add a second
            Response with <Code>{`{"status":"failed","note":"…"}`}</Code> and set it to{" "}
            <Strong>Configure run after → has failed</Strong> on the work step, so a failure is
            reported instead of left hanging.
          </li>
          <li>
            <Strong>Slow work</Strong> (over a few seconds)? Put a Response with status{" "}
            <Code>202</Code> right after the ping check instead — the flow keeps running after it —
            and end with an <Strong>HTTP</Strong> action: <Code>POST</Code> to the{" "}
            <Code>callbackUrl</Code> with the status JSON.
          </li>
        </OL>
        <Note>
          <Strong>Azure Logic Apps</Strong> works the same way: trigger <Strong>When a HTTP request is
          received</Strong>, the <Strong>Response</Strong> action to answer, and the{" "}
          <Strong>HTTP</Strong> action for the callback. Logic Apps can run an inline JavaScript step,
          so it can also check the signature.
        </Note>

        <H3>Zapier</H3>
        <P>
          Good for cloud apps (Google Workspace, Slack, Okta, HR systems). <Strong>Webhooks by
          Zapier</Strong> needs a paid Zapier plan. Zapier always replies on its own the moment it
          receives a call, so a Zap <Strong>always reports back on the callbackUrl</Strong> (way B).
          Zapier’s own instant reply says <Code>{`"status": "success"`}</Code>. That is not one of
          TestMate’s answers, so TestMate ignores it and waits for the callback.
        </P>
        <OL>
          <li>
            Create a Zap with the trigger <Strong>Webhooks by Zapier → Catch Hook</Strong> (or{" "}
            <Strong>Catch Raw Hook</Strong> if you want to check the signature — it keeps the headers
            and raw body). Copy the webhook address it gives you.
          </li>
          <li>Send it the sample (above), then <Strong>Test trigger</Strong> so Zapier learns the fields.</li>
          <li>
            Add <Strong>Filter by Zapier</Strong>: only continue if <Code>Event</Code> exactly matches{" "}
            <Code>service_request.fulfil</Code> — that stops test pings.
          </li>
          <li>Add the steps that do the work, using the request fields (requester email, answers…).</li>
          <li>
            Last step: <Strong>Webhooks by Zapier → POST</Strong>. URL = the <Strong>Callback Url</Strong>{" "}
            field, Payload type = <Strong>JSON</Strong>, Data: <Code>status</Code> ={" "}
            <Code>succeeded</Code> and <Code>note</Code> = what was done.
          </li>
          <li>Turn the Zap on.</li>
        </OL>
        <P>
          If a step fails, the Zap stops and never calls back; TestMate then marks the run failed
          after 24 hours. IT can <Strong>Retry</Strong> or <Strong>Handle it manually</Strong> sooner.
          Where your Zapier plan offers error handling on a step, add a POST to the callback with{" "}
          <Code>{`"status": "failed"`}</Code> there.
        </P>

        <H3>n8n</H3>
        <P>
          Good if you self-host or want full control — and it can check the signature. A self-hosted
          n8n must be reachable from the internet over <Code>https://</Code>; TestMate won’t call
          private-network addresses in production.
        </P>
        <OL>
          <li>
            Add a <Strong>Webhook</Strong> node: HTTP method <Code>POST</Code>, a path such as{" "}
            <Code>testmate</Code>, and <Strong>Respond: Using ‘Respond to Webhook’ node</Strong>.
            Copy the <Strong>Production URL</Strong> (the Test URL only works while the editor is listening).
          </li>
          <li>
            Add an <Strong>If</Strong> node: <Code>{`{{ $json.body.event }}`}</Code> equals{" "}
            <Code>ping</Code> → a <Strong>Respond to Webhook</Strong> node (response code 200) and stop.
          </li>
          <li>
            Optional signature check: a <Strong>Crypto</Strong> node, action <Strong>Hmac</Strong>, type{" "}
            <Strong>SHA256</Strong>, encoding hex, your secret, value{" "}
            <Code>{`{{ $json.headers["x-testmate-timestamp"] }}.{{ JSON.stringify($json.body) }}`}</Code>;
            then an If node comparing <Code>sha256=</Code> + the result with{" "}
            <Code>{`{{ $json.headers["x-testmate-signature"] }}`}</Code>. If it never matches, turn on
            the Webhook node’s <Strong>Raw Body</Strong> option and sign the raw text instead.
          </li>
          <li>Do the work (any n8n node, or an <Strong>HTTP Request</Strong> node to a system’s API).</li>
          <li>
            End with <Strong>Respond to Webhook</Strong> → JSON{" "}
            <Code>{`{"status":"succeeded","note":"…"}`}</Code>. For slow work, respond{" "}
            <Code>202</Code> early instead and finish with an <Strong>HTTP Request</Strong> node that
            POSTs the result to <Code>{`{{ $('Webhook').item.json.body.callbackUrl }}`}</Code>.
          </li>
          <li>Save and <Strong>activate</Strong> the workflow.</li>
        </OL>

        <H3>Make (formerly Integromat)</H3>
        <OL>
          <li>
            Start the scenario with <Strong>Webhooks → Custom webhook</Strong>, <Strong>Add</Strong> a
            hook and copy its address. Send it the sample so Make learns the data structure.
          </li>
          <li>Add a filter after it so only <Code>event</Code> = <Code>service_request.fulfil</Code> continues.</li>
          <li>Add the modules that do the work.</li>
          <li>
            End with <Strong>Webhooks → Webhook response</Strong>: status <Code>200</Code>, a{" "}
            <Code>Content-Type: application/json</Code> header, body{" "}
            <Code>{`{"status":"succeeded","note":"…"}`}</Code>. Without a Webhook response, Make replies
            “Accepted” on its own — then report back with an <Strong>HTTP → Make a request</Strong>{" "}
            POST to the <Code>callbackUrl</Code> instead.
          </li>
          <li>Turn the scenario on, scheduled to run <Strong>immediately</Strong> as data arrives.</li>
        </OL>

        <H3>Your own code</H3>
        <P>Any web service that can receive a POST works — an Azure Function, an AWS Lambda, a small server:</P>
        <CodeBlock>{`// Express (Node.js) — fromTestMate() is the function above
app.post("/testmate", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body.toString("utf8")
  if (!fromTestMate(req.headers, raw, process.env.TESTMATE_SECRET)) return res.sendStatus(401)
  const { event, deliveryId, request } = JSON.parse(raw)
  if (event === "ping") return res.sendStatus(200)

  if (await alreadyDone(deliveryId)) return res.json({ status: "succeeded", note: "Already done" })
  try {
    const person = request.requestedFor ?? request.requester
    await addToGroup(person.email, request.answers.software)
    await remember(deliveryId)
    res.json({ status: "succeeded", note: \`\${request.answers.software} assigned\` })
  } catch (e) {
    res.json({ status: "failed", note: e.message })
  }
})`}</CodeBlock>

        <H3>Any other tool</H3>
        <P>
          Pipedream, Workato, Tray, Logic Apps and most other automation tools work too. Check that
          the tool can do all four of these:
        </P>
        <OL>
          <li>Start a flow when it receives a <Code>POST</Code> with a JSON body, at a public <Code>https://</Code> address.</li>
          <li>Read fields from that body (<Code>event</Code>, <Code>request.requester.email</Code>, <Code>request.answers.…</Code>).</li>
          <li>
            Either reply with your own JSON (way A), or make an HTTP <Code>POST</Code> with a JSON
            body to the <Code>callbackUrl</Code> at the end (way B).
          </li>
          <li>Ignore <Code>ping</Code> events, or answer them with <Code>200</Code> and stop.</li>
        </OL>
        <P>
          Reading the headers and raw body to check the signature is a bonus. If the tool can’t, keep
          its address secret.
        </P>

        <H3>Common jobs, and where to find them</H3>
        <P>
          Do the work for <Code>request.requestedFor</Code> if it’s set, and for{" "}
          <Code>request.requester</Code> if not. Pick what to give from the form’s answers (for
          example <Code>answers.software</Code>).
        </P>
        <DocTable
          rows={[
            ["Job", "Power Automate (Microsoft 365)", "Zapier, n8n, Make, others"],
            [
              "Assign a software licence",
              <>Add the person to the group that carries the licence (group-based licensing): <Strong>Microsoft Entra ID → Add user to group</Strong></>,
              "The software’s own app or action. Otherwise an HTTP request to its admin API (Adobe Admin Console, Google Workspace Admin SDK…)",
            ],
            [
              "Give access to a team, share or app",
              <><Strong>Microsoft Entra ID → Add user to group</Strong>, then look up the group from the answer with a Switch or a lookup list</>,
              "The directory’s group action (Google Workspace, Okta, JumpCloud…)",
            ],
            [
              "Create an account for a new starter",
              <><Strong>Microsoft Entra ID → Create user</Strong>. With <Code>requestedFor.newStarter: true</Code>, the email is the one typed on the form</>,
              "The directory’s create-user action. Report the new sign-in name in the note",
            ],
            [
              "Tell a team",
              <><Strong>Microsoft Teams → Post message in a chat or channel</Strong></>,
              "Slack, Teams or email action",
            ],
            [
              "Raise a ticket in another system",
              <><Strong>HTTP</Strong> action to that system’s API (Jira, ServiceNow…)</>,
              <>Its app or an HTTP request. Send the ticket number back as <Code>externalReference</Code></>,
            ],
          ]}
        />
        <P>
          A job that needs a person part-way (ordering hardware, an approval in another system) is
          usually better left to IT. If a flow does wait for one, use way B; the callback stays
          open for 24 hours.
        </P>

        <H3>Connecting it in TestMate</H3>
        <OL>
          <li><Strong>Catalog setup → Automation → Connectors → New connector</Strong>: a name (“Adobe licences — Power Automate”) and the flow’s address.</li>
          <li>Copy the <Strong>signing secret</Strong> into your flow (if it checks signatures). It’s shown only once — <Strong>Replace secret</Strong> makes a new one and the old one stops working at once.</li>
          <li><Strong>Send a test</Strong>. You should see “It answered 200 in … ms”.</li>
          <li>Open the catalog item → <Strong>How it’s fulfilled → Automatically, by a connector</Strong> → pick the connector → Save.</li>
          <li>Submit a real test request for that item and approve it. Watch the request’s <Strong>Automation</Strong> card and the <Strong>Run log</Strong>.</li>
        </OL>
        <P>
          Switching a connector <Strong>off</Strong> pauses it: new requests for its items are flagged
          for IT to do by hand. A connector used by an item can’t be deleted — move the item to another
          way of fulfilment first.
        </P>

        <H3>Trying it without a real tool</H3>
        <P>
          Developers can run a pretend connector that prints what it receives and answers however you
          tell it to. In the <Code>server</Code> folder:
        </P>
        <CodeBlock>{`node scripts/fakeConnector.js            # listens on http://localhost:4010/hook

# PowerShell: set how it answers, then start it
$env:SECRET="<signing secret>"; $env:MODE="fail"; node scripts/fakeConnector.js`}</CodeBlock>
        <DocTable
          rows={[
            ["MODE", "It answers", "You should see"],
            ["succeed", `200 {"status":"succeeded"}`, "Fulfilled within seconds"],
            ["fail", `200 {"status":"failed"}`, "Automation failed; IT is told"],
            ["accept", "202, then calls back after DELAY ms (set RESULT=failed to make it fail)", "Waiting for result, then Fulfilled"],
            ["error", "503", "Retrying after 1, 5 and 15 minutes"],
            ["slow", "Nothing within 10 s", "Retrying"],
          ]}
        />

        <H3>When it doesn’t work</H3>
        <DocTable
          rows={[
            ["What you see", "Likely cause", "What to do"],
            ["Send a test: 401 or 403", "The flow only accepts signed-in callers", "Power Automate: set Who can trigger the flow to Anyone."],
            ["Send a test: 404", "Wrong address, the flow is off, or n8n’s Test URL was used", "Copy the address again; switch the flow on; use n8n’s Production URL."],
            ["Retrying, “didn’t answer within 10 seconds”", "The flow does the work before replying", "Reply 202 first and report back on the callbackUrl."],
            ["Waiting for result that never ends", "The flow replied but never called back (or failed before it)", "Add the callback step and a failure branch; or Handle it manually."],
            ["“The address must start with https://”", "A plain http address", "Use the tool’s https address."],
            ["“That address is on a private network”", "A self-hosted tool inside your network", "Publish it on a public https address (e.g. through a reverse proxy)."],
            ["Your flow rejects every call as unsigned", "Old secret, or the body was re-formatted before signing", "Replace secret and update the flow; sign the raw body exactly as received."],
            ["Requests aren’t sent to the connector at all", "The item isn’t set to use it, the connector is off, or the request is flagged for review", "Check the item’s How it’s fulfilled, switch the connector on, clear the review flag."],
          ]}
        />
      </div>
    ),
  },
  {
    id: "it-requests-reports",
    title: "IT request reports",
    icon: BarChart3,
    summary: "Pending work, overdue items, service levels and automation at a glance.",
    body: (
      <div className="space-y-4">
        <P>
          <Strong>IT requests → Reports</Strong> (IT agents and administrators) answers “where are
          we, and how are we doing?” for the last 7, 30 or 90 days, or 12 months:
        </P>
        <UL>
          <li><Strong>Right now</Strong> — open requests, waiting for approval, overdue approvals, ready for IT, overdue fulfilment, waiting on requesters.</li>
          <li><Strong>The period</Strong> — submitted and fulfilled, the share fulfilled on time, average approval and fulfilment times, escalations.</li>
          <li><Strong>Automation</Strong> — approved automatically, fulfilled automatically or by self-service, connector success rate, what needs review now.</li>
          <li><Strong>By category</Strong>, <Strong>by person</Strong>, and the <Strong>longest overdue</Strong> requests, each linking to the request.</li>
        </UL>
        <P>
          Every decision, change and automated step is also in the <a href="#activity" className="font-medium text-primary hover:underline">Activity log</a>{" "}
          — who approved what, when, and with what authority.
        </P>
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
  group("Tracking & tickets", ["bugs", "feature-requests", "linked-tickets", "feedback-portal"]),
  group("Support & live chat", [
    "client-companies",
    "live-chat",
    "company-provisioning",
    "ticket-form-api",
  ]),
  group("AI", ["ai-assistant"]),
  group("IT requests", [
    "it-requests",
    "it-requests-asking",
    "it-requests-approvals",
    "it-requests-queue",
    "it-requests-setup",
    "it-requests-items",
    "it-requests-automation",
    "it-requests-connectors",
    "it-requests-reports",
  ]),
  group("Administration", ["team", "activity"]),
  group("Help", ["announcements", "settings", "faq"]),
]

export const DOC_SECTIONS: DocSection[] = DOC_GROUPS.flatMap((g) => g.sections)
