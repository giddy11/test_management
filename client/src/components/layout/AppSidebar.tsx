import { NavLink } from "react-router-dom"
import { ChevronsUpDown, LogOut, FlaskConical, Eye } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuth, PREVIEWABLE_ROLES } from "@/contexts/AuthContext"
import { useLogout } from "@/hooks/useAuth"
import {
  navFor,
  navBottomFor,
  itNavFor,
  workspaceNavFor,
  IT_REQUEST_PERMISSIONS,
  ROLE_LABEL,
  type NavItem,
} from "@/components/layout/nav"
import { canAny } from "@/lib/can"
import { useServiceDeskCounts, useServiceDeskSettings } from "@/hooks/useServiceDesk"

export function AppSidebar() {
  const { user, realUser, permissions, isPreviewing, startPreview, exitPreview } = useAuth()
  const logout = useLogout()
  const { isMobile, setOpenMobile } = useSidebar()
  // IT requests is a separate module: its section depends on the permissions
  // AND on the organisation having it turned on.
  const inItRequests = canAny(permissions, IT_REQUEST_PERMISSIONS)
  const { data: deskSettings } = useServiceDeskSettings(inItRequests)
  const deskOn = Boolean(deskSettings?.enabled)
  const { data: deskCounts } = useServiceDeskCounts(inItRequests && deskOn)
  if (!user || !realUser) return null

  const previewOptions = isPreviewing ? [] : (PREVIEWABLE_ROLES[realUser.role] ?? [])

  const items = navFor(permissions)
  const bottomItems = navBottomFor(permissions)
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
  // Assigned roles are what the server checks; the legacy account type is only
  // the fallback. While previewing, `roles` is still the real user's, so the
  // previewed role's label has to win or the sidebar would contradict the view.
  const assignedRoleNames = isPreviewing ? [] : (user.roles ?? []).map((r) => r.name)
  const roleLabel = assignedRoleNames.length ? assignedRoleNames.join(", ") : ROLE_LABEL[user.role]
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const badgeFor = (item: NavItem): number => {
    if (item.badge === "approvals") return deskCounts?.pendingApprovals ?? 0
    if (item.badge === "queue") return deskCounts?.queue?.ready ?? 0
    return 0
  }
  const itItems = inItRequests ? itNavFor(permissions, deskOn) : []
  const groups = [
    // With only the testing side visible, the old "Navigation" label still reads right.
    { label: itItems.length ? "Testing" : "Navigation", items },
    { label: "IT requests", items: itItems },
    { label: "Workspace", items: workspaceNavFor(permissions) },
  ].filter((g) => g.items.length > 0)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[slot=sidebar-menu-button]:!p-1.5">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FlaskConical className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">TestMate</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.companyName ?? "Workspace"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const badge = badgeFor(item)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <NavLink to={item.to} end={item.end} data-tour={item.tourId} data-cy={`nav-${item.to.slice(1)}`} onClick={closeOnMobile}>
                        {({ isActive }) => (
                          <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                      {badge > 0 && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink
                    to={item.to}
                    target={item.newTab ? "_blank" : undefined}
                    rel={item.newTab ? "noreferrer" : undefined}
                    data-tour={item.tourId}
                    data-cy={`nav-${item.to.slice(1)}`}
                    onClick={closeOnMobile}
                  >
                    {({ isActive }) => (
                      <SidebarMenuButton tooltip={item.title} isActive={isActive && !item.newTab}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  data-cy="user-menu"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground" title={roleLabel} data-cy="user-role">
                      {roleLabel}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm">
                    <span className="font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                {(previewOptions.length > 0 || isPreviewing) && <DropdownMenuSeparator />}
                {isPreviewing ? (
                  <DropdownMenuItem onClick={exitPreview} data-cy="exit-preview">
                    <Eye className="mr-2 size-4" />
                    Exit preview
                  </DropdownMenuItem>
                ) : (
                  previewOptions.map((role) => (
                    <DropdownMenuItem key={role} onClick={() => startPreview(role)} data-cy={`preview-as-${role}`}>
                      <Eye className="mr-2 size-4" />
                      Preview as {ROLE_LABEL[role]}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-cy="logout">
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
