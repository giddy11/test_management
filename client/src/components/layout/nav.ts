// components/layout/nav.ts — role-aware navigation config.
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Building2,
  Settings,
  Activity,
  type LucideIcon,
} from "lucide-react"
import { UserRole, type UserRole as Role } from "@/types/auth.types"

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  roles?: Role[] // omitted = visible to everyone
  tourId?: string // used as the data-tour attribute for the onboarding tour
}

// Primary navigation — shown at the top of the sidebar.
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, tourId: "nav-dashboard" },
  { title: "Projects", to: "/projects", icon: FolderKanban, tourId: "nav-projects" },
  { title: "Team", to: "/team", icon: Users, roles: [UserRole.SUPERADMIN, UserRole.ADMIN], tourId: "nav-team" },
  { title: "Organisations", to: "/platform", icon: Building2, roles: [UserRole.SUPERADMIN] },
]

// Secondary navigation — pinned to the bottom of the sidebar.
export const NAV_BOTTOM_ITEMS: NavItem[] = [
  { title: "Activity", to: "/activity", icon: Activity, roles: [UserRole.SUPERADMIN, UserRole.ADMIN] },
  { title: "Settings", to: "/settings", icon: Settings, tourId: "nav-settings" },
]

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
}
