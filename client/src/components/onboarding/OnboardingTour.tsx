// components/onboarding/OnboardingTour.tsx — mounts once dashboard content exists;
// auto-starts the "Getting started" guide for a first-time company admin. Renders nothing.
import { useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useGuideTour } from "@/hooks/useGuideTour"
import { useUpdateOnboardingStatus } from "@/hooks/useOnboarding"
import { DASHBOARD_GUIDE } from "@/lib/tourGuides"
import { UserRole } from "@/types/auth.types"

// Module-level: at most one auto-start per page load. A per-instance ref is not
// enough — StrictMode double-mounts the component in dev, and two concurrent
// driver.js tours destroy each other's overlay.
let autoStartedThisLoad = false

export function OnboardingTour() {
  const { user } = useAuth()
  const updateStatus = useUpdateOnboardingStatus()
  const { startTour } = useGuideTour()

  useEffect(() => {
    if (autoStartedThisLoad) return
    if (user?.role === UserRole.ADMIN && user.onboardingCompleted === false) {
      autoStartedThisLoad = true
      startTour(DASHBOARD_GUIDE, () => updateStatus.mutate(true))
    }
  }, [user, startTour])

  return null
}
