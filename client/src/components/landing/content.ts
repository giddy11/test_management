// components/landing/content.ts — every string, list, and asset the landing
// page renders. Copy is derived from the product documentation
// (pages/docs/sections.tsx); nothing here is invented marketing.
import {
  Activity,
  Bug,
  Building2,
  FolderKanban,
  Lightbulb,
  ListChecks,
  MessageCircle,
  MessageSquareHeart,
  PlayCircle,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react"
import shotDashboard from "@/assets/docs/dashboard.png"
import shotSuitesAndCases from "@/assets/docs/suites-and-cases.png"
import shotTestRuns from "@/assets/docs/test-runs.png"
import shotBugs from "@/assets/docs/bugs.png"
import shotSupportQueue from "@/assets/docs/support-queue.png"
import shotLiveChatWidget from "@/assets/docs/live-chat-widget.png"

// ── Navigation ─────────────────────────────────────────────────────────────
export interface LandingNavLink {
  label: string
  href: string
}

export const LANDING_NAV: LandingNavLink[] = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Product", href: "#product" },
  { label: "Benefits", href: "#benefits" },
  { label: "FAQ", href: "#faq" },
]

// ── Hero ───────────────────────────────────────────────────────────────────
export const HERO = {
  eyebrow: "Test management for software teams",
  headline: "Plan your testing. Run it.",
  /** Rendered in the brand gradient, so keep it to the closing clause. */
  headlineAccent: "Track everything that falls out of it.",
  subhead:
    "TestMate gives your organisation one place to write test cases, execute runs, and follow the bugs, feature requests, and customer tickets that come out of them — without stitching four tools together.",
  primaryCta: { label: "Create your organisation", to: "/register" },
  secondaryCta: { label: "Read the docs", to: "/docs" },
  note: "Free to set up · Verify your email · No credit card",
} as const

/** Short claims under the hero — each is a product fact, not a metric. */
export const HERO_TRUST: string[] = [
  "Role-based access",
  "Realtime comments & presence",
  "Light and dark themes",
]

// ── Social proof ───────────────────────────────────────────────────────────
// PLACEHOLDER SLOT — intentionally empty. The logo strip renders only once real,
// permitted customer logos are added here; nothing fictional ships by default.
export interface ClientLogo {
  name: string
  /** Imported SVG/PNG asset for the customer's wordmark. */
  src: string
}
export const CLIENT_LOGOS: ClientLogo[] = []

// PLACEHOLDER SLOT — intentionally empty for the same reason. Add real, attributed
// quotes only; the testimonial grid stays hidden while this is empty.
export interface Testimonial {
  quote: string
  author: string
  role: string
}
export const TESTIMONIALS: Testimonial[] = []

/** Capability facts about the product — deliberately not business metrics. */
export interface ProductFact {
  value: string
  label: string
}

export const PRODUCT_FACTS: ProductFact[] = [
  // Three, not four: Super Admin is the platform-operator role and is never
  // held by a customer's organisation, so it stays off the public pages.
  { value: "3", label: "Roles, from Company Admin to a client's IT desk" },
  { value: "0", label: "Accounts needed for someone to raise a ticket" },
  { value: "2", label: "Support tiers before a ticket reaches your team" },
  { value: "1", label: "Script tag to put live chat on your own site" },
]

export interface AudienceRole {
  icon: LucideIcon
  title: string
  description: string
}

export const AUDIENCE_ROLES: AudienceRole[] = [
  {
    icon: ListChecks,
    title: "Testers",
    description:
      "Write repeatable cases with steps and expected results, then work through a run recording pass or fail case by case.",
  },
  {
    icon: Users,
    title: "Company Admins",
    description:
      "Create the projects, add the team, decide who sees what, and audit every action from the organisation-wide activity log.",
  },
  {
    icon: Building2,
    title: "Client IT desks",
    description:
      "Give a customer's own support team the first pass at their users' tickets, and see only what they escalate to you.",
  },
  {
    icon: MessageSquareHeart,
    title: "The people using your product",
    description:
      "Report a bug or request a feature from a public link, then follow it to resolution — no account required.",
  },
]

// ── Features ───────────────────────────────────────────────────────────────
export interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

export const FEATURES: Feature[] = [
  {
    icon: FolderKanban,
    title: "Projects & suites",
    description:
      "One project per product area, holding its suites, runs, bugs, feature requests, and tickets. Visibility is assignment-scoped.",
  },
  {
    icon: ListChecks,
    title: "Test cases that scale",
    description:
      "Write cases with steps and an expected result, bulk-import a whole suite from the spreadsheet template, and export any time.",
  },
  {
    icon: PlayCircle,
    title: "Test runs",
    description:
      "Execute a suite as a run and record results case by case, keeping the full history of every past execution.",
  },
  {
    icon: Bug,
    title: "Bug tracking",
    description:
      "Report bugs with separate severity and priority, then move them through a lifecycle your whole team can see.",
  },
  {
    icon: Lightbulb,
    title: "Feature requests",
    description:
      "Collect ideas, let people vote on them, and discuss each one in realtime comments under a shareable reference code.",
  },
  {
    icon: MessageSquareHeart,
    title: "Public ticket portal",
    description:
      "Share a link and collect tickets from outside your organisation. Submitters get a code, a status, and email updates.",
  },
  {
    icon: Building2,
    title: "Client companies",
    description:
      "A two-tier support model: a customer's own IT desk triages first, auto-assigning to its least-busy member, and escalates the rest.",
  },
  {
    icon: MessageCircle,
    title: "Live chat widget",
    description:
      "Embed a chat widget on your own website and answer visitors from inside TestMate, without leaving the app.",
  },
  {
    icon: Webhook,
    title: "Provisioning API",
    description:
      "Auto-create a client company from your own signup flow, so their support queue exists the moment they land.",
  },
  {
    icon: ShieldCheck,
    title: "Roles & permissions",
    description:
      "Company Admin, User, and IT Support each see exactly their slice — and admins can preview the app as a lower role.",
  },
  {
    icon: Activity,
    title: "Activity log",
    description:
      "An audit trail of what happened across the organisation, so you can always answer who changed what, and when.",
  },
  {
    icon: Users,
    title: "Team management",
    description:
      "Admins create teammate accounts directly — no self-registration, no waiting on invites to be accepted.",
  },
]

// ── How it works ───────────────────────────────────────────────────────────
export interface Step {
  title: string
  description: string
}

export const STEPS: Step[] = [
  {
    title: "Create your organisation",
    description:
      "Register, verify your email, and you are the administrator of a fresh workspace. A guided tour walks you through the first run.",
  },
  {
    title: "Add your team and a project",
    description:
      "Create teammate accounts from the Team page and assign them to the projects they should be working on.",
  },
  {
    title: "Write suites and cases",
    description:
      "Group related checks into suites and write each case with its steps and expected result — or import a whole suite in bulk.",
  },
  {
    title: "Run the suite",
    description:
      "Execute a run and record pass or fail case by case. Anything that fails becomes a tracked bug in the same project.",
  },
  {
    title: "Close the loop",
    description:
      "Bugs, feature requests, and customer tickets all land back in the project, and roll up onto the dashboard.",
  },
]

// ── Product showcase ───────────────────────────────────────────────────────
export interface Showcase {
  value: string
  label: string
  caption: string
  src: string
  /** Intrinsic size of the file, so the image reserves its box before loading. */
  width: number
  height: number
  /** Rendered in the mock browser's address bar. */
  path: string
  /** Render in a phone-shaped frame rather than a browser frame. */
  mobile?: boolean
}

export const SHOWCASES: Showcase[] = [
  {
    value: "dashboard",
    label: "Dashboard",
    caption: "A live overview of testing across every project you are on.",
    src: shotDashboard,
    width: 1708,
    height: 959,
    path: "/dashboard",
  },
  {
    value: "cases",
    label: "Suites & cases",
    caption: "Suites of repeatable cases, importable and exportable in bulk.",
    src: shotSuitesAndCases,
    width: 1708,
    height: 959,
    path: "/projects/checkout/suites/auth",
  },
  {
    value: "runs",
    label: "Test runs",
    caption: "Work through a suite, recording a result for each case.",
    src: shotTestRuns,
    width: 1708,
    height: 959,
    path: "/projects/checkout/runs/42",
  },
  {
    value: "bugs",
    label: "Bugs",
    caption: "Severity and priority tracked separately, through one lifecycle.",
    src: shotBugs,
    width: 1708,
    height: 959,
    path: "/projects/checkout/bugs/ref/BUG-018",
  },
  {
    value: "support",
    label: "Support queue",
    caption: "A client company's IT desk triaging its own users' tickets.",
    src: shotSupportQueue,
    width: 1800,
    height: 959,
    path: "/support",
  },
  {
    value: "chat",
    label: "Live chat",
    caption: "The embeddable widget, as a visitor on your own site sees it.",
    src: shotLiveChatWidget,
    width: 525,
    height: 850,
    path: "yourproduct.com",
    mobile: true,
  },
]

// ── Benefits ───────────────────────────────────────────────────────────────
export interface BenefitGroup {
  icon: LucideIcon
  title: string
  summary: string
  points: string[]
}

export const BENEFIT_GROUPS: BenefitGroup[] = [
  {
    icon: Building2,
    title: "For the business",
    summary: "One system of record instead of four half-connected ones.",
    points: [
      "Test plans, bugs, requests, and customer tickets share a project — no exports to reconcile.",
      "A client's IT desk absorbs first-line volume before anything reaches your engineers.",
      "Every action is logged, so audits and post-mortems have a single source of truth.",
      "External reporters need no seats, so support volume never becomes a licensing question.",
    ],
  },
  {
    icon: Users,
    title: "For the team",
    summary: "Less coordination overhead, more of the work that matters.",
    points: [
      "Bulk-import an existing suite from the spreadsheet template instead of retyping it.",
      "Realtime comments and presence mean discussion happens where the work is.",
      "Reference codes like BUG-018 give every item a link you can paste anywhere.",
      "Guided tours and searchable docs get new teammates productive without a walkthrough.",
    ],
  },
]

// ── FAQ ────────────────────────────────────────────────────────────────────
export interface Faq {
  question: string
  answer: string
}

export const FAQS: Faq[] = [
  {
    question: "How do my teammates get accounts?",
    answer:
      "Admins create accounts from the Team page — teammates do not register themselves. Registration is only for creating a brand-new organisation.",
  },
  {
    question: "Can people outside my organisation report issues?",
    answer:
      "Yes. Share the project's public ticket link. Submitters do not need an account, and they get email updates as their ticket progresses.",
  },
  {
    question: "Someone raised a ticket and wants to check on it — do they need an account?",
    answer:
      "No. They go to /my-tickets, enter the email they submitted with, and get a 6-digit code by email. From there they can see every ticket they have raised and reply in the conversation.",
  },
  {
    question: "What is the difference between a bug's severity and its priority?",
    answer:
      "Severity measures impact — how bad it is when it happens. Priority measures urgency — how soon it should be fixed. A cosmetic typo on the homepage might be Trivial severity but High priority.",
  },
  {
    question: "Should I use live chat or the ticket form?",
    answer:
      "Live chat suits quick, conversational questions from visitors on your site and leaves no lifecycle behind. The ticket form suits anything that needs tracking to a resolution — it gets a code, a status, and email updates.",
  },
  {
    question: "Why can a teammate not see a project they are working on?",
    answer:
      "Project visibility is assignment-scoped: you only see projects you are a member of. A Company Admin, or the project's owner, can add them as a member.",
  },
  {
    question: "Should I delete outdated test cases?",
    answer:
      "Prefer marking them Deprecated. You keep the history of past runs while excluding them from future work.",
  },
]

// ── Footer ─────────────────────────────────────────────────────────────────
export interface FooterLink {
  label: string
  to: string
}

export interface FooterColumn {
  title: string
  links: FooterLink[]
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Features", to: "#features" },
      { label: "How it works", to: "#how-it-works" },
      { label: "Product tour", to: "#product" },
      { label: "FAQ", to: "#faq" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", to: "/docs" },
      { label: "Getting started", to: "/docs#getting-started" },
      { label: "Roles & permissions", to: "/docs#roles" },
      { label: "Provisioning API", to: "/docs#company-provisioning" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", to: "/login" },
      { label: "Create an organisation", to: "/register" },
      { label: "Track a ticket", to: "/my-tickets" },
    ],
  },
]

// PLACEHOLDER SLOT — intentionally empty. Add the product's real profiles and
// the footer renders them; no invented handles ship in the meantime.
export interface SocialLink {
  label: string
  href: string
  icon: LucideIcon
}
export const SOCIAL_LINKS: SocialLink[] = []

export const FOOTER_TAGLINE = "Simplified test planning, execution, and tracking."
