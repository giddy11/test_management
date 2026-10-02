import { Outlet } from "react-router-dom"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { GlobalSearch } from "@/components/layout/GlobalSearch"
import { WhatsNewDialog } from "@/components/layout/WhatsNewDialog"
import { SiteBannerBar } from "@/components/layout/SiteBannerBar"
import { PreviewBanner } from "@/components/layout/PreviewBanner"
import { PresenceProvider } from "@/contexts/PresenceContext"
import { useAuth } from "@/contexts/AuthContext"
// Internal support widgets — both commented out, not deleted. The WhatsApp
// hand-off now only happens via the embeddable widget on a project's own
// external site (see WhatsAppWidgetPage); TestMate's own dashboard shows
// neither the old in-app support chat nor the Contact support button.
// import { SupportChatWidget } from "@/components/support-chat/SupportChatWidget"
// import { ContactSupportWidget } from "@/components/contact-support/ContactSupportWidget"

export function DashboardLayout() {
  // Everything global search can return hangs off a project, so an account with
  // no project surface at all (an external company's IT supporters) gets no
  // search box — the API would refuse it anyway.
  const { can } = useAuth()

  return (
    <PresenceProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PreviewBanner />
          <SiteBannerBar />
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="hidden text-sm font-medium sm:inline">TestMate</span>
            <div className="ml-auto flex items-center gap-1">
              {can("project.read") && <GlobalSearch />}
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
          <WhatsNewDialog />
          {/* <SupportChatWidget /> */}
          {/* <ContactSupportWidget /> */}
        </SidebarInset>
      </SidebarProvider>
    </PresenceProvider>
  )
}
