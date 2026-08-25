// components/landing/LandingFooter.tsx — site footer. In-page anchors stay plain
// <a>; anything that changes route goes through react-router's Link.
import { Link } from "react-router-dom"
import { Mail } from "lucide-react"
import { Wordmark } from "@/components/landing/Wordmark"
import { SectionLink } from "@/components/landing/SectionLink"
import { cn } from "@/lib/utils"
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL_LINKS,
  FOOTER_TAGLINE,
  SOCIAL_LINKS,
  type FooterLink,
} from "@/components/landing/content"

const LINK_CLASS =
  "rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-brand focus-visible:ring-[3px] focus-visible:ring-brand/40"

// Support address for the public pages. Point this at your own inbox.
const CONTACT_EMAIL = "support@testmate.app"

function FooterNavLink({ link }: { link: FooterLink }) {
  // Bare anchors target landing-page sections, which do not exist on the other
  // pages this footer appears on — SectionLink resolves that.
  if (link.to.startsWith("#")) {
    return (
      <SectionLink href={link.to} className={LINK_CLASS}>
        {link.label}
      </SectionLink>
    )
  }
  return (
    <Link to={link.to} className={LINK_CLASS}>
      {link.label}
    </Link>
  )
}

export function LandingFooter() {
  return (
    <footer className="py-12 sm:py-16">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        {/* Five tracks only once there is room; two columns of links on tablets. */}
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm text-pretty text-muted-foreground">
              {FOOTER_TAGLINE}
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className={cn(LINK_CLASS, "mt-4 inline-flex items-center gap-2")}
            >
              <Mail className="size-4" aria-hidden />
              {CONTACT_EMAIL}
            </a>

            {SOCIAL_LINKS.length > 0 && (
              <ul className="mt-5 flex items-center gap-1">
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={social.label}
                      className={cn(
                        LINK_CLASS,
                        "flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <social.icon className="size-4" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterNavLink link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} TestMate. All rights reserved.
          </p>
          <nav aria-label="Legal">
            <ul className="flex items-center gap-x-4 text-xs">
              {FOOTER_LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={cn(LINK_CLASS, "text-xs")}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
