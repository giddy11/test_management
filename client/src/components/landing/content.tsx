// components/landing/content.tsx — every string, list, and asset the landing
// page renders. Copy is derived from the product documentation
// (pages/docs/sections.tsx); nothing here is invented marketing.
//
// A .tsx file because some copy needs to link somewhere. Keep it to data and
// short inline markup — no components, so it stays fast-refresh friendly.
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  BellRing,
  Bug,
  Building2,
  Eye,
  FlaskConical,
  FolderKanban,
  Gauge,
  Headset,
  KeyRound,
  Layers,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Lock,
  MessageCircle,
  MessageSquareHeart,
  PlayCircle,
  Repeat,
  ScrollText,
  Server,
  ShieldCheck,
  TrendingUp,
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
  { label: "Solution", href: "#solution" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Product", href: "#product" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
]

// ── Hero ───────────────────────────────────────────────────────────────────
export const HERO = {
  eyebrow: "Software testing & IT service management",
  headline: "Higher-quality software.",
  /** Rendered in the brand gradient, so keep it to the closing clause. */
  headlineAccent: "More efficient IT services.",
  subhead:
    "TestMate is an all-in-one platform for managing software testing, defects, service requests, and IT operations — so your teams stop stitching four tools together.",
  primaryCta: { label: "Start your free trial", to: "/register" },
  secondaryCta: { label: "Read the docs", to: "/docs" },
  note: "Free to set up · Verify your email · No credit card",
} as const

/** Short claims under the hero — each is a product fact, not a metric. */
export const HERO_TRUST: string[] = [
  "Role-based access",
  "Realtime comments & presence",
  "Light and dark themes",
]

// ── The problem (overview deck, "The Core Problem Stats") ──────────────────
export interface ProblemStat {
  icon: LucideIcon
  value: string
  title: string
  description: string
}

export const PROBLEM_STATS: ProblemStat[] = [
  {
    icon: Layers,
    value: "70%",
    title: "Tool overload",
    description:
      "70%+ of organisations experience challenges with fragmented IT systems and tools.",
  },
  {
    icon: Repeat,
    value: "40%",
    title: "Recurring incidents",
    description:
      "40%+ of IT incidents can be linked to recurring or preventable issues.",
  },
]

// PLACEHOLDER — the deck states these figures without a citation. Publishing an
// unsourced statistic is a claim you have to stand behind, so name the research
// here and the attribution line appears under the figures.
export const PROBLEM_STATS_SOURCE = "[Source for the figures above]"

// ── The two pillars (deck, page 1) ─────────────────────────────────────────
export interface Pillar {
  icon: LucideIcon
  title: string
  description: string
}

export const PILLARS: Pillar[] = [
  {
    icon: FlaskConical,
    title: "Software Testing & Quality Management",
    description:
      "Helps software teams plan, execute, monitor, and improve software quality throughout the development lifecycle.",
  },
  {
    icon: Headset,
    title: "IT Service Management",
    description:
      "Helps IT teams and service providers manage, deliver, monitor, and continuously improve IT services from a centralised platform.",
  },
]

// ── The solution (deck, "The Solution & Value Proposition") ────────────────
export interface ValueProp {
  icon: LucideIcon
  title: string
  description: string
}

export const VALUE_PROPS: ValueProp[] = [
  {
    icon: LifeBuoy,
    title: "Manage IT services",
    description:
      "Centralise incidents, service requests, and support workflows — from a public portal, live chat, or a client's own IT desk — in one platform.",
  },
  {
    icon: ShieldCheck,
    title: "Improve software quality",
    description:
      "Plan and manage testing, defects, and quality processes to deliver more reliable software and digital solutions.",
  },
  {
    icon: Eye,
    title: "Greater visibility",
    description:
      "Route work, escalate it, and log every action, while providing real-time visibility into service and quality performance.",
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

// ── Smart Dashboard (deck, "Product Deep Dive" + "Key Benefits: The Why") ──
export const DASHBOARD = {
  eyebrow: "Product deep dive",
  title: "One view. Complete IT visibility.",
  lead: "The Smart Dashboard gives IT teams and service providers a real-time view of their service operations and software quality, bringing critical performance data into one centralised workspace.",
} as const

export interface DashboardBenefit {
  icon: LucideIcon
  title: string
  description: string
}

export const DASHBOARD_BENEFITS: DashboardBenefit[] = [
  {
    icon: Activity,
    title: "Real-time service monitoring",
    description:
      "Track incidents, service requests, response times, resolution times, and outstanding tickets as they move.",
  },
  {
    icon: Gauge,
    title: "Quality & performance insights",
    description:
      "Monitor defects, testing progress, recurring issues, service trends, and team performance.",
  },
  {
    icon: TrendingUp,
    title: "Intelligent analytics",
    description:
      "Identify bottlenecks, recurring problems, workload trends, and areas requiring immediate attention.",
  },
  {
    icon: BellRing,
    title: "Actionable alerts",
    description:
      "Surface overdue tickets, critical incidents, and unresolved issues so teams can act quickly.",
  },
]

// ── Security (deck, "Security and Major Platform Reliability") ─────────────
export const SECURITY = {
  eyebrow: "Security & reliability",
  title: "Built for secure, reliable IT service delivery",
  lead: "TestMate is designed to support organisations that require secure access, reliable service management, controlled workflows, and continuous availability across their IT operations.",
} as const

export interface SecurityPoint {
  icon: LucideIcon
  title: string
  description: string
}

export const SECURITY_POINTS: SecurityPoint[] = [
  {
    icon: KeyRound,
    title: "Secure access",
    description:
      "Passwords are hashed, never stored in readable form. Sign-in uses short-lived tokens, with optional Google Sign-In.",
  },
  {
    icon: Lock,
    title: "Controlled workflows",
    description:
      "Role-based access and per-project assignment mean people see only the work that is theirs to do.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    description:
      "Every consequential action is written to the organisation's activity log — who did what, to which item, and when.",
  },
  {
    icon: Server,
    title: "Managed infrastructure",
    description:
      "Encrypted in transit and at rest on managed cloud infrastructure, with email verification on every account.",
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
  /** Plain text, or JSX where the answer needs to link somewhere. */
  answer: ReactNode
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
    // Relative route, not an absolute URL: this stays correct on any domain and
    // navigates client-side instead of reloading the app.
    answer: (
      <>
        No. They go to{" "}
        <Link to="/my-tickets" className="font-medium text-brand hover:underline">
          /my-tickets
        </Link>
        , enter the email they submitted with, and get a 6-digit code by email. From there
        they can see every ticket they have raised and reply in the conversation.
      </>
    ),
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
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Sub-processors", to: "/privacy#sharing" },
      { label: "Data retention", to: "/privacy#retention" },
    ],
  },
]

/** Repeated in the footer's bottom bar, where people look for them first. */
export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
]

// PLACEHOLDER SLOT — intentionally empty. Add the product's real profiles and
// the footer renders them; no invented handles ship in the meantime.
export interface SocialLink {
  label: string
  href: string
  icon: LucideIcon
}
export const SOCIAL_LINKS: SocialLink[] = []

/** Contact details, from the TestMate overview deck. */
export const CONTACT = {
  email: "support@thegrowthplug.com",
  phone: "+234 916 381 8000",
  phoneHref: "tel:+2349163818000",
  website: "www.thegrowthplug.com",
  websiteHref: "https://www.thegrowthplug.com",
  locations: "United Kingdom · Nigeria",
} as const

export const FOOTER_TAGLINE = "Simplified test planning, execution, and tracking."
