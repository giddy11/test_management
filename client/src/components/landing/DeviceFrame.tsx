// components/landing/DeviceFrame.tsx — chrome around the real product
// screenshots in src/assets/docs. Purely decorative, so the frame furniture is
// hidden from assistive tech and the alt text carries the meaning.
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

function TrafficLights() {
  return (
    <div className="flex gap-1.5" aria-hidden>
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
    </div>
  )
}

interface BrowserFrameProps {
  /** Shown in the mock address bar, e.g. "/dashboard". */
  path: string
  children: ReactNode
  className?: string
}

export function BrowserFrame({ path, children, className }: BrowserFrameProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-xl shadow-foreground/5 ring-1 ring-black/3 dark:shadow-black/30",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2.5">
        <TrafficLights />
        <div
          className="flex h-6 min-w-0 flex-1 items-center rounded-md bg-background px-2.5 text-[11px] text-muted-foreground"
          aria-hidden
        >
          <span className="truncate">testmate.app{path}</span>
        </div>
      </div>
      {children}
    </div>
  )
}

interface PhoneFrameProps {
  children: ReactNode
  className?: string
}

export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-64 rounded-4xl border-8 border-foreground/85 bg-foreground/85 shadow-xl shadow-foreground/10 dark:border-foreground/15 dark:bg-foreground/15",
        className,
      )}
    >
      <div className="overflow-hidden rounded-3xl bg-background">
        {children}
      </div>
    </div>
  )
}

interface ProductShotProps {
  src: string
  alt: string
  /** Intrinsic pixel size — reserves the box so lazy loading cannot shift the page. */
  width: number
  height: number
  /** The hero shot is above the fold, so it should not be lazy-loaded. */
  eager?: boolean
  className?: string
}

export function ProductShot({
  src,
  alt,
  width,
  height,
  eager,
  className,
}: ProductShotProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto w-full", className)}
    />
  )
}
