// pages/public/LandingPage.tsx — the marketing home page at "/".
// Standalone layout, like DocsPage: no DashboardLayout, its own header and
// footer. Signed-in users never see it — they are sent to their role's home.
import { useEffect } from "react"
import { Navigate } from "react-router-dom"
import { PageLoader } from "@/components/shared/PageLoader"
import { LandingHeader } from "@/components/landing/LandingHeader"
import { HeroSection } from "@/components/landing/HeroSection"
import { ProblemSection } from "@/components/landing/ProblemSection"
import { SolutionSection } from "@/components/landing/SolutionSection"
import { SecuritySection } from "@/components/landing/SecuritySection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { HowItWorksSection } from "@/components/landing/HowItWorksSection"
import { ShowcaseSection } from "@/components/landing/ShowcaseSection"
import { BenefitsSection } from "@/components/landing/BenefitsSection"
import { FaqSection } from "@/components/landing/FaqSection"
import { CtaSection } from "@/components/landing/CtaSection"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { homePathFor } from "@/components/layout/nav"
import { useAuth } from "@/contexts/AuthContext"

export default function LandingPage() {
  const { user, isLoading } = useAuth()

  // Smooth in-page anchor scrolling, scoped to this page (the scrolling element
  // is <html>, so it cannot be set from a wrapper div) and skipped for anyone
  // who has asked for reduced motion.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("motion-safe:scroll-smooth")
    return () => root.classList.remove("motion-safe:scroll-smooth")
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageLoader />
      </div>
    )
  }

  if (user) {
    return <Navigate to={homePathFor(user.permissions ?? [])} replace />
  }

  return (
    <div className="min-h-svh bg-background" data-cy="landing-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <LandingHeader />

      <main id="main">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ShowcaseSection />
        <BenefitsSection />
        <SecuritySection />
        <FaqSection />
        <CtaSection />
      </main>

      <LandingFooter />
    </div>
  )
}
