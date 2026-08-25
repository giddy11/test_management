// components/landing/ProblemSection.tsx — the case for consolidating, from the
// TestMate overview deck ("The Core Problem Stats").
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { PROBLEM_STATS, PROBLEM_STATS_SOURCE } from "@/components/landing/content"

export function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="problem-heading"
          eyebrow="The problem"
          title="Fragmented tools, repeating incidents"
          lead="Testing, defects, and service requests usually live in separate systems. The work leaks between them, and the same problems come back."
        />

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 sm:grid-cols-2">
          {PROBLEM_STATS.map((stat, i) => (
            <Reveal key={stat.title} delay={i * 80}>
              <Card className="h-full gap-4 py-8 text-center">
                <CardContent className="space-y-3">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong to-brand text-brand-foreground shadow-sm shadow-brand/25">
                    <stat.icon className="size-5" aria-hidden />
                  </div>
                  <p className="bg-linear-to-br from-brand-strong via-brand to-brand-accent bg-clip-text text-5xl font-semibold tracking-tight tabular-nums text-transparent">
                    {stat.value}
                  </p>
                  <h3 className="text-lg font-semibold">{stat.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Source: {PROBLEM_STATS_SOURCE}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
