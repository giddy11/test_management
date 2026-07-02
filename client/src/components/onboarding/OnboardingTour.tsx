// components/onboarding/OnboardingTour.tsx — mounts once dashboard content exists;
// auto-starts the "Getting started" guide for a first-time company admin. Renders nothing.
import { useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useGuideTour } from "@/hooks/useGuideTour"
import { useUpdateOnboardingStatus } from "@/hooks/useOnboarding"
import { DASHBOARD_GUIDE } from "@/lib/tourGuides"
import { UserRole } from "@/types/auth.types"

export function OnboardingTour() {
  const { user } = useAuth()
  const updateStatus = useUpdateOnboardingStatus()
  const { startTour } = useGuideTour()
  const hasFired = useRef(false)

  useEffect(() => {
    if (hasFired.current) return
    if (user?.role === UserRole.ADMIN && user.onboardingCompleted === false) {
      hasFired.current = true
      startTour(DASHBOARD_GUIDE, () => updateStatus.mutate(true))
    }
  }, [user, startTour])

  return null
}
