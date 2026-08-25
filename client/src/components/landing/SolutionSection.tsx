// components/landing/SolutionSection.tsx — the two halves of the platform and
// what consolidating them buys you. From the TestMate overview deck
// ("The Solution & Value Proposition").
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { PILLARS, VALUE_PROPS } from "@/components/landing/content"

export function SolutionSection() {
  return (
    <section
      id="solution"
      aria-labelledby="solution-heading"
      className="scroll-mt-16 border-b bg-linear-to-b from-brand-soft/50 via-muted/20 to-background py-20 sm:py-24 dark:from-brand-soft/20"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="solution-heading"
          eyebrow="The solution"
          title="One platform, two disciplines"
          lead="Software quality and IT service delivery run on the same work — a failed test becomes a defect, a defect becomes a ticket. TestMate keeps both in one system."
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-2">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 80}>
              <Card className="relative h-full overflow-hidden py-8">
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-strong via-brand to-brand-accent"
                />
                <CardContent className="space-y-4">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong to-brand text-brand-foreground shadow-sm shadow-brand/25">
                    <pillar.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-balance">
                    {pillar.title}
                  </h3>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        <ul className="mx-auto mt-6 grid max-w-5xl gap-6 md:grid-cols-3">
          {VALUE_PROPS.map((prop, i) => (
            <li key={prop.title}>
              <Reveal delay={i * 60} className="h-full">
                <Card className="h-full gap-4 py-6 transition-shadow hover:shadow-md hover:shadow-brand/10">
                  <CardContent className="space-y-3">
                    <div className="flex size-9 items-center justify-center rounded-lg border border-brand/20 bg-background text-brand">
                      <prop.icon className="size-4.5" aria-hidden />
                    </div>
                    <h3 className="font-semibold">{prop.title}</h3>
                    <p className="text-sm text-pretty text-muted-foreground">
                      {prop.description}
                    </p>
                  </CardContent>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
