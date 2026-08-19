// components/landing/HeroSection.tsx — headline, the two calls to action, and a
// real screenshot of the dashboard in a browser frame. The backdrop layers a
// dot grid under two drifting brand-coloured blobs; all of it is decorative.
import { Link } from "react-router-dom"
import { ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/Reveal"
import { BrowserFrame, ProductShot } from "@/components/landing/DeviceFrame"
import { HERO, HERO_TRUST, SHOWCASES } from "@/components/landing/content"

// The hero shot is the same dashboard screenshot the showcase leads with.
const HERO_SHOT = SHOWCASES[0]

/** Dotted backdrop, faded out towards the bottom of the hero. */
const DOT_GRID_STYLE = {
  backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  maskImage: "linear-gradient(to bottom, black, transparent 75%)",
  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
} as const

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-136 bg-linear-to-b from-brand-soft/70 to-background dark:from-brand-soft/25" />
      <div className="absolute inset-x-0 top-0 h-136 opacity-60" style={DOT_GRID_STYLE} />
      <div className="tm-aurora absolute -top-32 -left-24 size-96 rounded-full bg-brand/25 blur-3xl dark:bg-brand/20" />
      <div className="tm-aurora tm-aurora-slow absolute -top-24 right-0 size-96 rounded-full bg-brand-accent/25 blur-3xl dark:bg-brand-accent/15" />
    </div>
  )
}

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden border-b"
    >
      <HeroBackdrop />

      <div className="mx-auto max-w-[90rem] px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-background/70 px-3.5 py-1.5 text-xs font-medium text-brand shadow-sm shadow-brand/10 backdrop-blur">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {HERO.eyebrow}
            </p>
          </Reveal>

          <Reveal delay={60}>
            <h1
              id="hero-heading"
              className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
            >
              {HERO.headline}{" "}
              <span className="bg-linear-to-r from-brand-strong via-brand to-brand-accent bg-clip-text text-transparent">
                {HERO.headlineAccent}
              </span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
              {HERO.subhead}
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                variant="brand"
                className="group w-full sm:w-auto"
                data-cy="hero-primary-cta"
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
                className="w-full backdrop-blur sm:w-auto"
                data-cy="hero-secondary-cta"
              >
                <Link to={HERO.secondaryCta.to}>{HERO.secondaryCta.label}</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{HERO.note}</p>
          </Reveal>

          <Reveal delay={240}>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {HERO_TRUST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground"
                >
                  <Check className="size-4 text-brand" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={300} className="mt-14 sm:mt-20">
          <div className="relative mx-auto max-w-5xl">
            {/* Glow pooling under the frame, so the screenshot sits on the
                brand rather than floating on a flat white page. */}
            <div
              aria-hidden
              className="absolute -inset-x-8 -top-6 bottom-8 -z-10 rounded-[3rem] bg-linear-to-r from-brand/30 via-brand-accent/25 to-brand/30 blur-3xl"
            />
            <BrowserFrame path={HERO_SHOT.path} className="ring-brand/10">
              <ProductShot
                src={HERO_SHOT.src}
                width={HERO_SHOT.width}
                height={HERO_SHOT.height}
                eager
                alt="The TestMate dashboard, showing test run activity across projects"
              />
            </BrowserFrame>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
