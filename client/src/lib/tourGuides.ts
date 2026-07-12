// lib/tourGuides.ts — declarative step data for every driver.js-powered guided tour.
import { Compass, FolderKanban, Layers, MessageSquareHeart, Users, type LucideIcon } from "lucide-react"
import { UserRole } from "@/types/auth.types"

export interface TourStep {
  id: string
  route?: string // navigate here before highlighting, if not already there
  target?: string // CSS selector; omit for a centered, untargeted popover
  title: string
  description: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  // When true, Next/Back are hidden — the user must click the real highlighted
  // element (which performs the real action) to advance to the next step.
  advanceOnClick?: boolean
}

export interface TourGuide {
  id: string
  title: string
  description: string
  icon: LucideIcon
  roles?: UserRole[] // omitted = visible to every role
  requiresProject?: boolean // guide navigates into an existing project — disabled until one exists
  steps: TourStep[]
}

export const DASHBOARD_GUIDE: TourGuide = {
  id: "dashboard-intro",
  title: "Getting started",
  description: "A quick tour of your dashboard and main navigation.",
  icon: Compass,
  roles: [UserRole.ADMIN],
  steps: [
    { id: "welcome", title: "Welcome to TestMate 👋", description: "Let's take a 60-second tour of your new workspace." },
    { id: "nav-dashboard", target: '[data-tour="nav-dashboard"]', side: "right", align: "center",
      title: "Your Dashboard", description: "A live snapshot of testing activity across your whole organisation." },
    { id: "nav-projects", target: '[data-tour="nav-projects"]', side: "right", align: "center",
      title: "Projects", description: "Projects group your test suites and test cases. Create your first one here." },
    { id: "nav-team", target: '[data-tour="nav-team"]', side: "right", align: "center",
      title: "Team", description: "Invite teammates and assign them roles from here." },
    { id: "stat-cards", target: '[data-tour="stat-cards"]', side: "bottom", align: "start",
      title: "Key metrics", description: "Track projects, suites, cases, and runs at a glance." },
    { id: "nav-settings", target: '[data-tour="nav-settings"]', side: "right", align: "center",
      title: "Settings", description: "Manage your profile and security — and replay any guide anytime from Settings → Help." },
    { id: "done", title: "You're all set!", description: "Explore TestMate at your own pace. Happy testing!" },
  ],
}

export const CREATE_PROJECT_GUIDE: TourGuide = {
  id: "create-project",
  title: "Create a project",
  description: "Set up a project to organise your test suites and runs.",
  icon: FolderKanban,
  roles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  steps: [
    { id: "cp-welcome", title: "Create your first project",
      description: "Projects group your test suites and test runs. Let's create one together." },
    { id: "cp-new-project-btn", route: "/projects", target: '[data-tour="new-project-btn"]', side: "bottom", align: "center",
      advanceOnClick: true, title: "New project", description: "Click here to open the project form." },
    { id: "cp-submit", target: '[data-tour="create-project-submit-btn"]', side: "top", align: "end",
      advanceOnClick: true, title: "Name it and save",
      description: "Give your project a name (and optional description), then click \"Create project\"." },
    { id: "cp-done", title: "Nicely done!",
      description: "Click your new project's card anytime to add test suites and start testing." },
  ],
}

export const SUITES_AND_RUNS_GUIDE: TourGuide = {
  id: "suites-and-runs",
  title: "Add test suites & run tests",
  description: "Add a test suite to an existing project and start your first test run.",
  icon: Layers,
  roles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  requiresProject: true,
  steps: [
    { id: "sr-welcome", title: "Add test suites & run tests",
      description: "This guide walks you through adding a test suite and starting your first test run." },
    { id: "sr-new-suite-btn", target: '[data-tour="new-suite-btn"]', side: "bottom", align: "end",
      advanceOnClick: true, title: "New test suite", description: "Click \"New suite\" to group related test cases together." },
    { id: "sr-suite-submit", target: '[data-tour="create-suite-submit-btn"]', side: "top", align: "end",
      advanceOnClick: true, title: "Name your suite", description: "Give it a name, then click \"Create suite\"." },
    { id: "sr-runs-tab", target: '[data-tour="runs-tab-trigger"]', side: "bottom", align: "center",
      advanceOnClick: true, title: "Switch to Test Runs", description: "Click the \"Test Runs\" tab to start executing tests." },
    { id: "sr-start-run-btn", target: '[data-tour="start-run-btn"]', side: "bottom", align: "end",
      advanceOnClick: true, title: "Start a run", description: "Click \"Start run\" to snapshot your suite's test cases into a run." },
    { id: "sr-run-submit", target: '[data-tour="create-run-submit-btn"]', side: "top", align: "end",
      advanceOnClick: true, title: "Launch the run",
      description: "Pick the suite (pre-filled if there's only one), then click \"Start run\" — you'll land on the execution screen." },
    { id: "sr-record-results", target: '[data-tour="result-status-btns"]', side: "left", align: "center",
      title: "Record results",
      description: "Mark each test case Pass, Fail, Blocked, or Skipped as you execute it. No rows here? Add test cases to the suite first." },
    { id: "sr-done", title: "You're testing!", description: "Mark the run \"Completed\" once you've recorded every result." },
  ],
}

export const ADD_TEAM_MEMBER_GUIDE: TourGuide = {
  id: "add-team-member",
  title: "Add a team member",
  description: "Invite a teammate and assign them a role.",
  icon: Users,
  roles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  steps: [
    { id: "tm-welcome", title: "Invite your team",
      description: "Add teammates so they can help create and execute tests." },
    { id: "tm-add-user-btn", route: "/team", target: '[data-tour="add-user-btn"]', side: "bottom", align: "end",
      advanceOnClick: true, title: "Add user", description: "Click \"Add user\" to invite a teammate." },
    { id: "tm-submit", target: '[data-tour="create-user-submit-btn"]', side: "top", align: "end",
      advanceOnClick: true, title: "Fill in their details",
      description: "Enter their name, email, a temporary password, and role, then click \"Add user\"." },
    { id: "tm-done", title: "Team member added!",
      description: "Share their temporary password securely — ask them to change it after signing in." },
  ],
}

export const SHARE_FEEDBACK_LINK_GUIDE: TourGuide = {
  id: "share-feedback-link",
  title: "Share a feedback link",
  description: "Let people outside your company submit bugs and feature requests without a TestMate account.",
  icon: MessageSquareHeart,
  roles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  requiresProject: true,
  steps: [
    { id: "sf-welcome", title: "Share a feedback link",
      description: "Every project has a public link you can share with people outside your company — end users, clients, testers — so they can report bugs and feature requests without signing up for TestMate." },
    { id: "sf-feedback-tab", target: '[data-tour="feedback-tab-trigger"]', side: "bottom", align: "center",
      advanceOnClick: true, title: "Open the Feedback tab", description: "Click \"Feedback\" to manage your project's public link." },
    { id: "sf-link-card", target: '[data-tour="feedback-link-card"]', side: "top", align: "start",
      title: "Enable & copy the link", description: "Click \"Enable public form\", then \"Copy link\" and share it however you like — embedded in your app, by email, or in a support page. Submitters get email updates as you work each item." },
    { id: "sf-done", title: "That's it!", description: "You can disable the link anytime from the same card." },
  ],
}

export const ALL_GUIDES: TourGuide[] = [
  DASHBOARD_GUIDE,
  CREATE_PROJECT_GUIDE,
  SUITES_AND_RUNS_GUIDE,
  ADD_TEAM_MEMBER_GUIDE,
  SHARE_FEEDBACK_LINK_GUIDE,
]
