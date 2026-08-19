// components/landing/LandingHeader.tsx — sticky marketing header. Mirrors the
// docs header (same height, blur, and lockup) so the public pages feel like one
// site, and collapses its nav into a Sheet on small screens.
import { useState } from "react"
import { Link } from "react-router-dom"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { Wordmark } from "@/components/landing/Wordmark"
import { LANDING_NAV } from "@/components/landing/content"
import { homePathForRole } from "@/components/layout/nav"
import { useAuth } from "@/contexts/AuthContext"

export function LandingHeader() {
  const { user, isLoading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
        <Wordmark />

        <nav aria-label="Landing page sections" className="ml-8 hidden lg:block">
          <ul className="flex items-center gap-1">
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:text-brand focus-visible:ring-[3px] focus-visible:ring-brand/40"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {!isLoading &&
            (user ? (
              <Button asChild size="sm" variant="brand" data-cy="landing-app-cta">
                <Link to={homePathForRole(user.role)}>Go to app</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="brand" data-cy="landing-header-cta">
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            ))}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
                data-cy="landing-menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Landing page sections" className="px-4 pb-6">
                <ul className="space-y-0.5">
                  {LANDING_NAV.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/docs"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                    >
                      Documentation
                    </Link>
                  </li>
                </ul>
                {!isLoading && !user && (
                  <Button asChild variant="outline" className="mt-4 w-full sm:hidden">
                    <Link to="/login" onClick={() => setMenuOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
