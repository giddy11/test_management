import { useEffect, useState } from "react"
import { NavLink } from "react-router-dom"
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, LogOut, FlaskConical, Eye, MonitorDown } from "lucide-react"
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
  SidebarSeparator,
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
import { cn } from "@/lib/utils"
import { useAuth, PREVIEWABLE_ROLES } from "@/contexts/AuthContext"
import { useLogout } from "@/hooks/useAuth"
import { useInstallPrompt } from "@/hooks/useInstallPrompt"
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
import { TOUR_EXPAND_NAV_EVENT } from "@/lib/tourGuides"

// Which sections the person has folded away, kept per browser.
const COLLAPSED_KEY = "tm_nav_collapsed"

function loadCollapsed(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : []
  } catch {
    return []
  }
}

function saveCollapsed(labels: string[]) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(labels))
  } catch {
    // Private mode or blocked storage: the sections still fold, just not across visits.
  }
}

export function AppSidebar() {
  const { user, realUser, permissions, isPreviewing, startPreview, exitPreview } = useAuth()
  const logout = useLogout()
  // Only once the browser says the app can be installed (never in Safari).
  const { canInstall, install } = useInstallPrompt()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const [collapsed, setCollapsedState] = useState<string[]>(loadCollapsed)
  const setCollapsed = (labels: string[]) => {
    setCollapsedState(labels)
    saveCollapsed(labels)
  }
  // Tours point at nav items, which a folded section would hide.
  useEffect(() => {
    const expandAll = () => {
      setCollapsedState([])
      saveCollapsed([])
    }
    window.addEventListener(TOUR_EXPAND_NAV_EVENT, expandAll)
    return () => window.removeEventListener(TOUR_EXPAND_NAV_EVENT, expandAll)
  }, [])
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

  // In icon mode the labels are hidden, so folding a section would only hide icons.
  const iconMode = state === "collapsed" && !isMobile
  const isOpen = (label: string) => iconMode || !collapsed.includes(label)
  const allFolded = groups.every((g) => collapsed.includes(g.label))
  const toggleGroup = (label: string) =>
    setCollapsed(collapsed.includes(label) ? collapsed.filter((l) => l !== label) : [...collapsed, label])

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
        {/* In the header rather than the list, so it stays put while the sections scroll. */}
        {groups.length > 1 && (
          <div className="-mb-1 flex justify-end px-1 group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              onClick={() => setCollapsed(allFolded ? [] : groups.map((g) => g.label))}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              data-cy="nav-toggle-all"
            >
              {allFolded ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
              {allFolded ? "Expand all" : "Collapse all"}
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="tm-scroll gap-0">
        {groups.map((group) => {
          const open = isOpen(group.label)
          // A folded section would hide its pending counts, so they ride on its header.
          const foldedCount = open ? 0 : group.items.reduce((n, item) => n + badgeFor(item), 0)
          return (
            <SidebarGroup key={group.label} className="py-1.5">
              <SidebarGroupLabel asChild>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={open}
                  tabIndex={iconMode ? -1 : undefined}
                  className="w-full cursor-pointer transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:pointer-events-none"
                  data-cy={`nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span>{group.label}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {foldedCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                        {foldedCount}
                      </span>
                    )}
                    <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
                  </span>
                </button>
              </SidebarGroupLabel>
              {open && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const badge = badgeFor(item)
                      return (
                        <SidebarMenuItem key={item.to}>
                          <NavLink to={item.to} end={item.end} data-tour={item.tourId} data-cy={`nav-${item.to.slice(1)}`} onClick={closeOnMobile}>
                            {({ isActive }) => (
                              <SidebarMenuButton tooltip={item.title} isActive={isActive} className={cn(badge > 0 && "pr-8")}>
                                <item.icon />
                                <span>{item.title}</span>
                              </SidebarMenuButton>
                            )}
                          </NavLink>
                          {/* The button sits inside the link, so the badge's own "beside the button"
                              positioning never matches — centre it on this row explicitly. */}
                          {badge > 0 && (
                            <SidebarMenuBadge className="top-1/2 -translate-y-1/2 rounded-full bg-primary text-primary-foreground" data-cy={`nav-badge-${item.to.slice(1)}`}>
                              {badge}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="gap-1">
        {/* Pinned outside the scrolling list so Settings and the rest never scroll away. */}
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
        <SidebarSeparator className="mx-0" />
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
                {canInstall && (
                  <DropdownMenuItem onClick={() => void install()} data-cy="install-app">
                    <MonitorDown className="mr-2 size-4" />
                    Install app
                  </DropdownMenuItem>
                )}
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
