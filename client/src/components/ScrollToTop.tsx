// components/ScrollToTop.tsx — restores scroll position on navigation.
// A real browser navigation starts at the top of the new document; a
// client-side route change does not, so following a link from the foot of a
// long page (the landing footer, say) would otherwise open the next page
// halfway down. Renders nothing; must live inside the Router.
import { useEffect } from "react"
import { useLocation } from "react-router-dom"

export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // A hash asks for a specific section, so honour it instead. This also
    // covers a fresh load of a deep link, where the browser's own anchor jump
    // happens before React has rendered the target.
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      if (target) {
        target.scrollIntoView()
        return
      }
    }
    // "instant" so a page that opted into smooth scrolling for its in-page
    // anchors doesn't animate the whole way back up on arrival.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [pathname, hash])

  return null
}
