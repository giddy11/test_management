// components/landing/SectionLink.tsx — a link to a landing-page section.
//
// The landing header and footer are reused on the legal pages, where anchors
// like "#product" point at nothing. So: on the landing page these stay plain
// anchors, scrolling in place without a route change; anywhere else they become
// links back to the landing page's anchor, which <ScrollToTop> then honours.
import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"

const LANDING_PATH = "/"

interface SectionLinkProps {
  /** In-page anchor, including the leading hash — e.g. "#product". */
  href: string
  className?: string
  onClick?: () => void
  children: ReactNode
}

export function SectionLink({ href, className, onClick, children }: SectionLinkProps) {
  const { pathname } = useLocation()

  if (pathname === LANDING_PATH) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }

  return (
    <Link to={`${LANDING_PATH}${href}`} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
