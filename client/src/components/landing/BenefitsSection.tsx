// components/landing/BenefitsSection.tsx — two comparison cards, one framed for
// the business and one for the team doing the work.
import { Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { BENEFIT_GROUPS } from "@/components/landing/content"

export function BenefitsSection() {
  return (
    <section
      id="benefits"
      aria-labelledby="benefits-heading"
      className="scroll-mt-16 border-b bg-muted/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="benefits-heading"
          eyebrow="Benefits"
          title="Fewer tools to reconcile, less work to chase"
          lead="The same consolidation pays off differently depending on where you sit."
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-2">
          {BENEFIT_GROUPS.map((group, i) => (
            <Reveal key={group.title} delay={i * 80}>
              <Card className="relative h-full overflow-hidden">
                {/* Brand hairline along the top edge. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-strong via-brand to-brand-accent"
                />
                <CardHeader className="gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong to-brand text-brand-foreground shadow-sm shadow-brand/25">
                    <group.icon className="size-5" aria-hidden />
                  </div>
                  <CardTitle className="text-lg tracking-tight">
                    {group.title}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{group.summary}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {group.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-pretty">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
