// components/layout/SiteBannerBar.tsx — superadmin's live, scrolling broadcast
// banner. Mounted once, above the header, so it's visible on every authenticated page.
import { Megaphone } from "lucide-react"
import { useSiteBanner } from "@/hooks/useSiteBanner"

export function SiteBannerBar() {
  const { banner, isVisible } = useSiteBanner()

  if (!isVisible) return null

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-primary px-3 text-primary-foreground">
      <Megaphone className="size-4 shrink-0" />
      <div className="tm-marquee-track">
        <span className="tm-marquee-text text-sm font-medium">{banner.message}</span>
      </div>
    </div>
  )
}
