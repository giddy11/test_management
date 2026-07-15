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
import { WhatsNewDialog } from "@/components/layout/WhatsNewDialog"
import { SiteBannerBar } from "@/components/layout/SiteBannerBar"
import { PreviewBanner } from "@/components/layout/PreviewBanner"
import { PresenceProvider } from "@/contexts/PresenceContext"
import { SupportChatWidget } from "@/components/support-chat/SupportChatWidget"

export function DashboardLayout() {
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
            <span className="text-sm font-medium">TestMate</span>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
          <WhatsNewDialog />
          <SupportChatWidget />
        </SidebarInset>
      </SidebarProvider>
    </PresenceProvider>
  )
}
