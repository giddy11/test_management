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
}

// Primary navigation — shown at the top of the sidebar.
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read", tourId: "nav-dashboard" },
  { title: "Projects", to: "/projects", icon: FolderKanban, permission: "project.read", tourId: "nav-projects" },
  { title: "All tickets", to: "/all-feedback", icon: MessageSquareHeart, permission: "ticket.read" },
  { title: "Ticket queue", to: "/support", icon: Headset, permission: "supportqueue.read" },
  { title: "SLA reports", to: "/support/sla", icon: Gauge, permission: "sla.read" },
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

export function navBottomFor(permissions: string[]): NavItem[] {
  return NAV_BOTTOM_ITEMS.filter((item) => visible(item, permissions))
}

// Where a user lands after login, and where a permission-mismatched navigation
// bounces to. External supporters live in the support portal; everyone else on
// the dashboard. Falls back to /settings, which every authenticated user can
// reach, so a role with neither permission never lands on a page it can't open.
export function homePathFor(permissions: string[]): string {
  if (can(permissions, "dashboard.read")) return "/dashboard"
  if (can(permissions, "supportqueue.read")) return "/support"
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
