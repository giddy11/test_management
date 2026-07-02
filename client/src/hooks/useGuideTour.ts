// hooks/useGuideTour.ts — thin React wrapper around the driver.js instance.
// Drives any TourGuide: navigates between routes and waits for elements to
// mount (including inside dialogs opened by the user) before highlighting.
import { useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { driver, type Driver, type DriveStep, type AllowedButtons } from "driver.js"
import { useIsMobile } from "@/hooks/use-mobile"
import type { TourGuide } from "@/lib/tourGuides"

// Polls the DOM (via MutationObserver) until `selector` appears or `timeout` elapses.
// Needed because dialogs, tabs, and route changes mount elements asynchronously.
function waitForElement(selector: string, timeout = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(true)
      return
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect()
        resolve(true)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(Boolean(document.querySelector(selector)))
    }, timeout)
  })
}

export function useGuideTour() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const driverRef = useRef<Driver | null>(null)
  // Guards onDestroyed from firing onComplete when we destroy+recreate the
  // instance internally to move to a step whose element wasn't ready yet —
  // only a real close (X, Esc, overlay click, or the final Done) should count.
  const transitioningRef = useRef(false)

  const goToStep = useCallback(
    async (guide: TourGuide, driveSteps: DriveStep[], index: number, onComplete?: () => void) => {
      const step = guide.steps[index]
      if (!step) return

      if (step.route && window.location.pathname !== step.route) {
        navigate(step.route)
        await new Promise((r) => setTimeout(r, 50))
      }

      let target = step.target
      if (target) {
        const found = await waitForElement(target)
        // Element never showed up (e.g. no test cases in the suite yet) —
        // fall back to a centered popover instead of a broken highlight.
        if (!found) target = undefined
      }

      // driver.js doesn't reliably re-resolve a step's element after
      // setSteps()+drive(index) once the element exists later than
      // construction time — it silently keeps highlighting a 0x0 dummy node.
      // Recreating the instance with the now-resolvable selector sidesteps
      // that internal caching entirely.
      transitioningRef.current = true
      driverRef.current?.destroy()
      transitioningRef.current = false

      const patched = [...driveSteps]
      patched[index] = { ...patched[index], element: target }

      const instance = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        overlayOpacity: 0.6,
        stagePadding: 4,
        popoverClass: "tm-onboarding-popover",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        steps: patched,
        onHighlightStarted: (element, _step, opts) => {
          const idx = opts.state.activeIndex ?? 0
          const cfg = guide.steps[idx]
          if (cfg?.advanceOnClick && element) {
            const handler = () => {
              setTimeout(() => {
                if (idx + 1 < guide.steps.length) void goToStep(guide, patched, idx + 1, onComplete)
                else {
                  transitioningRef.current = false
                  opts.driver.destroy()
                }
              }, 300)
            }
            element.addEventListener("click", handler, { once: true })
          }
        },
        onDestroyed: () => {
          if (!transitioningRef.current) onComplete?.()
        },
      })
      driverRef.current = instance
      instance.drive(index)
    },
    [navigate]
  )

  const startTour = useCallback(
    (guide: TourGuide, onComplete?: () => void) => {
      const steps = guide.steps.filter((s) => !isMobile || !s.target?.startsWith('[data-tour="nav-'))
      const filteredGuide: TourGuide = { ...guide, steps }

      const driveSteps: DriveStep[] = steps.map((step, i) => ({
        element: step.target,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
          showButtons: step.advanceOnClick ? (["close"] as AllowedButtons[]) : undefined,
          onNextClick: () => {
            if (i + 1 < steps.length) void goToStep(filteredGuide, driveSteps, i + 1, onComplete)
            else {
              transitioningRef.current = false
              driverRef.current?.destroy()
            }
          },
          onPrevClick: () => {
            if (i - 1 >= 0) void goToStep(filteredGuide, driveSteps, i - 1, onComplete)
          },
        },
      }))

      void goToStep(filteredGuide, driveSteps, 0, onComplete)
    },
    [isMobile, goToStep]
  )

  return { startTour }
}
