// components/layout/nav.ts — role-aware navigation config.
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Building2,
  Megaphone,
  MessageSquareHeart,
  MessagesSquare,
  Headset,
  Settings,
  Activity,
  BookOpen,
  type LucideIcon,
} from "lucide-react"
import { UserRole, type UserRole as Role } from "@/types/auth.types"

// Every internal (product-org) role — excludes external IT supporters.
const INTERNAL_ROLES: Role[] = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER]

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  roles?: Role[] // omitted = visible to everyone
  tourId?: string // used as the data-tour attribute for the onboarding tour
  newTab?: boolean // open in a new tab (e.g. docs) so the user keeps their place
}

// Primary navigation — shown at the top of the sidebar.
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: INTERNAL_ROLES, tourId: "nav-dashboard" },
  { title: "Projects", to: "/projects", icon: FolderKanban, roles: INTERNAL_ROLES, tourId: "nav-projects" },
  { title: "All feedback", to: "/all-feedback", icon: MessageSquareHeart, roles: INTERNAL_ROLES },
  { title: "Support queue", to: "/support", icon: Headset, roles: [UserRole.IT_SUPPORT] },
  { title: "Team", to: "/team", icon: Users, roles: [UserRole.SUPERADMIN, UserRole.ADMIN], tourId: "nav-team" },
  { title: "Organisations", to: "/platform", icon: Building2, roles: [UserRole.SUPERADMIN] },
  { title: "Announcements", to: "/announcements", icon: Megaphone, roles: [UserRole.SUPERADMIN] },
  { title: "Support inbox", to: "/support-inbox", icon: MessagesSquare, roles: [UserRole.SUPERADMIN] },
]

// Secondary navigation — pinned to the bottom of the sidebar.
export const NAV_BOTTOM_ITEMS: NavItem[] = [
  { title: "Activity", to: "/activity", icon: Activity, roles: [UserRole.SUPERADMIN, UserRole.ADMIN] },
  { title: "Activity", to: "/support/activity", icon: Activity, roles: [UserRole.IT_SUPPORT] },
  { title: "Documentation", to: "/docs", icon: BookOpen, newTab: true },
  { title: "Settings", to: "/settings", icon: Settings, tourId: "nav-settings" },
]

// Where each role lands after login (and where role-mismatched navigation
// bounces to). IT supporters live in the support portal, not the dashboard.
export function homePathForRole(role: Role): string {
  return role === UserRole.IT_SUPPORT ? "/support" : "/dashboard"
}

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

export function navBottomForRole(role: Role): NavItem[] {
  return NAV_BOTTOM_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Admin",
  admin: "Company Admin",
  user: "User",
  it_support: "IT Support",
}
