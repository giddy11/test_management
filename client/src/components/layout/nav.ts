// components/layout/nav.ts — role-aware navigation config.
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Building2,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { UserRole, type UserRole as Role } from "@/types/auth.types"

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  roles?: Role[] // omitted = visible to everyone
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", to: "/projects", icon: FolderKanban },
  { title: "Team", to: "/team", icon: Users, roles: [UserRole.SUPERADMIN, UserRole.ADMIN] },
  { title: "Organisations", to: "/platform", icon: Building2, roles: [UserRole.SUPERADMIN] },
  { title: "Settings", to: "/settings", icon: Settings },
]

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Admin",
  admin: "Company Admin",
  user: "User",
}
