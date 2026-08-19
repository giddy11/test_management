// components/landing/CtaSection.tsx — the closing call to action, on a full
// brand gradient panel. Text and buttons here sit on brand, not on the page
// background, so they use fixed light values rather than theme tokens.
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/Reveal"
import { HERO } from "@/components/landing/content"

/** Sheen across the panel — decorative, and identical in both themes. */
const SHEEN_STYLE = {
  backgroundImage:
    "radial-gradient(60% 80% at 15% 0%, rgba(255,255,255,0.25), transparent), radial-gradient(50% 70% at 90% 100%, rgba(255,255,255,0.18), transparent)",
} as const

export function CtaSection() {
  return (
    <section aria-labelledby="cta-heading" className="border-b py-20 sm:py-24">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <Reveal>
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl bg-linear-to-br from-brand-strong via-brand to-brand-accent px-6 py-14 text-center shadow-2xl shadow-brand/30 sm:px-12">
            <div aria-hidden className="absolute inset-0" style={SHEEN_STYLE} />
            <div className="relative">
              <h2
                id="cta-heading"
                className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl"
              >
                Start with one project and one suite
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-white/85">
                Register, verify your email, and your organisation is ready. Add
                the rest of the team once you have seen a run through.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="group w-full bg-white text-brand-strong shadow-lg hover:bg-white/90 focus-visible:ring-white/50 sm:w-auto"
                  data-cy="final-cta"
                >
                  <Link to={HERO.primaryCta.to}>
                    {HERO.primaryCta.label}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white focus-visible:ring-white/50 sm:w-auto dark:border-white/40 dark:bg-white/10 dark:hover:bg-white/20"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
