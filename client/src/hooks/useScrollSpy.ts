// hooks/useScrollSpy.ts — tracks which of a set of section elements is
// currently being read, for table-of-contents highlighting. Used by the docs
// page and the legal pages.
import { useEffect, useState } from "react"

/**
 * @param ids     Section element ids, in document order.
 * @param offset  Distance from the top of the viewport that counts as the
 *                reading line — normally the sticky header's height plus a
 *                little breathing room.
 */
export function useScrollSpy(ids: string[], offset = 96) {
  const [activeId, setActiveId] = useState(ids[0] ?? "")

  useEffect(() => {
    // Active section = the last one whose top sits at or above the reading
    // line (just below the sticky header).
    let ticking = false
    const update = () => {
      ticking = false
      let current = ids[0] ?? ""
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= offset) current = id
      }
      // The last section can be too short to ever cross the reading line, so
      // reaching the bottom of the page counts as reading it.
      const bottomReached =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (bottomReached && ids.length > 0) current = ids[ids.length - 1]
      setActiveId(current)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [ids, offset])

  return activeId
}
