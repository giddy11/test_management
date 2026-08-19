// components/landing/HowItWorksSection.tsx — the five steps from signing up to a
// closed loop, drawn as a vertical timeline that stays legible on any width.
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { STEPS } from "@/components/landing/content"

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-16 border-b bg-linear-to-b from-brand-soft/50 via-muted/20 to-background py-20 sm:py-24 dark:from-brand-soft/20"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="how-it-works-heading"
          eyebrow="How it works"
          title="From an empty workspace to a closed loop"
          lead="Five steps, in the order you would actually do them. A guided tour covers the same ground the first time you sign in."
        />

        <ol className="mx-auto mt-14 max-w-3xl">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 60}>
                <div className="flex gap-5">
                  {/* Number rail — the connector is decorative, so the list
                      still reads correctly when it is not painted. */}
                  <div className="flex flex-col items-center">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-brand text-sm font-semibold text-brand-foreground tabular-nums shadow-md shadow-brand/25">
                      {i + 1}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span
                        className="w-px flex-1 bg-linear-to-b from-brand/40 to-brand/5"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className={i < STEPS.length - 1 ? "pb-8" : ""}>
                    <h3 className="text-lg font-semibold tracking-tight">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
