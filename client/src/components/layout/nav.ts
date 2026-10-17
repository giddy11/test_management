// components/layout/nav.ts — permission-aware navigation config.
//
// Items are filtered by what the viewer may actually do, not by their role
// name. This is FOR USABILITY ONLY: every destination re-checks on the server,
// so hiding an item here never grants or withholds access by itself.
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Building2,
  Megaphone,
  MessageSquareHeart,
  MessagesSquare,
  Headset,
  Gauge,
  Settings,
  Activity,
  BookOpen,
  Store,
  ClipboardList,
  ListChecks,
  Inbox,
  Settings2,
  type LucideIcon,
} from "lucide-react"
import { can, canAny } from "@/lib/can"
import { UserRole, type UserRole as Role } from "@/types/auth.types"

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  /** Permission required to see this item. Omitted = visible to everyone. */
  permission?: string
  /** Any one of these is enough. Use instead of `permission`, not alongside. */
  anyOf?: string[]
  tourId?: string // used as the data-tour attribute for the onboarding tour
  newTab?: boolean // open in a new tab (e.g. docs) so the user keeps their place
  end?: boolean // active only on this exact path, not its children
  badge?: "approvals" | "queue" // live count shown next to the title
}

// The sidebar is three labelled groups: the testing product, IT requests (a
// module of its own — see docs/it-service-requests-plan.md), and the workspace
// things both share. Each is filtered by permission; an empty group is hidden.

// Testing — what TestMate has always been.
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read", tourId: "nav-dashboard" },
  { title: "Projects", to: "/projects", icon: FolderKanban, permission: "project.read", tourId: "nav-projects" },
  { title: "All tickets", to: "/all-feedback", icon: MessageSquareHeart, permission: "project.read" },
  { title: "Ticket queue", to: "/support", icon: Headset, permission: "supportqueue.read" },
  // Not sla.read: administrators hold that for the SLA tab on the dashboard.
  // This item is the supporter portal's own SLA page.
  { title: "SLA reports", to: "/support/sla", icon: Gauge, permission: "supportqueue.read" },
]

// IT requests. Everything here also depends on the organisation having the
// module turned on — see itNavFor.
export const IT_NAV_ITEMS: NavItem[] = [
  { title: "Request something", to: "/requests", icon: Store, permission: "servicerequest.create", end: true },
  { title: "My requests", to: "/requests/mine", icon: ClipboardList, permission: "servicerequest.create" },
  { title: "Approvals", to: "/requests/approvals", icon: ListChecks, anyOf: ["servicerequest.create", "servicedesk.manage"], badge: "approvals" },
  { title: "IT queue", to: "/requests/queue", icon: Inbox, permission: "servicedesk.work", badge: "queue" },
  { title: "Catalog setup", to: "/requests/catalog", icon: Settings2, permission: "servicedesk.manage" },
]

// Workspace — shared by both products.
export const WORKSPACE_NAV_ITEMS: NavItem[] = [
  // user.read is deliberately NOT the bar here: engineers hold it so the
  // assignee picker works, but the Team page exists to manage people.
  { title: "Team", to: "/team", icon: Users, permission: "user.create", tourId: "nav-team" },
  { title: "Organisations", to: "/platform", icon: Building2, permission: "platform.read" },
  { title: "Announcements", to: "/announcements", icon: Megaphone, permission: "announcement.manage" },
  { title: "Support inbox", to: "/support-inbox", icon: MessagesSquare, permission: "supportchat.read" },
]

// Secondary navigation — pinned to the bottom of the sidebar.
export const NAV_BOTTOM_ITEMS: NavItem[] = [
  { title: "Activity", to: "/activity", icon: Activity, permission: "audit.read" },
  { title: "Documentation", to: "/docs", icon: BookOpen, newTab: true },
  { title: "Settings", to: "/settings", icon: Settings, tourId: "nav-settings" },
]

function visible(item: NavItem, permissions: string[]): boolean {
  if (item.anyOf) return canAny(permissions, item.anyOf)
  if (item.permission) return can(permissions, item.permission)
  return true
}

export function navFor(permissions: string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => visible(item, permissions))
}

// While the module is off, only the people who set it up see it — so they
// can build the catalog before turning it on.
export function itNavFor(permissions: string[], enabled: boolean): NavItem[] {
  if (!enabled) return IT_NAV_ITEMS.filter((item) => item.to === "/requests/catalog" && visible(item, permissions))
  return IT_NAV_ITEMS.filter((item) => visible(item, permissions))
}

export function workspaceNavFor(permissions: string[]): NavItem[] {
  return WORKSPACE_NAV_ITEMS.filter((item) => visible(item, permissions))
}

// Anyone holding one of these may see the IT-requests section at all.
export const IT_REQUEST_PERMISSIONS = ["servicerequest.create", "servicedesk.work", "servicedesk.manage"]

export function navBottomFor(permissions: string[]): NavItem[] {
  return NAV_BOTTOM_ITEMS.filter((item) => visible(item, permissions))
}

// Where a user lands after login, and where a permission-mismatched navigation
// bounces to. External supporters live in the support portal; everyone else on
// the dashboard; IT-requests-only people on the request portal. Falls back to /settings, which every authenticated user can
// reach, so a role with neither permission never lands on a page it can't open.
export function homePathFor(permissions: string[]): string {
  if (can(permissions, "dashboard.read")) return "/dashboard"
  if (can(permissions, "supportqueue.read")) return "/support"
  // Someone with only the IT-requests side (the Employee role) lands on the
  // request portal, never a testing page they can't open.
  if (can(permissions, "servicerequest.create")) return "/requests"
  if (can(permissions, "servicedesk.work")) return "/requests/queue"
  return "/settings"
}

// Display labels for the legacy users.role column, still shown on the Team
// screen alongside the assigned roles while that column exists.
export const ROLE_LABEL: Record<Role, string> = {
  [UserRole.SUPERADMIN]: "Super Admin",
  [UserRole.ADMIN]: "Company Admin",
  [UserRole.USER]: "User",
  [UserRole.IT_SUPPORT]: "IT Support",
}
