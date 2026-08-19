// components/landing/FeaturesSection.tsx — the capability grid, one card per
// entry in FEATURES.
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { FEATURES } from "@/components/landing/content"

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="features-heading"
          eyebrow="Features"
          title="Everything testing produces, tracked in one place"
          lead="Test plans and their fallout normally live in different tools. In TestMate they share a project, so nothing has to be exported, matched up, or chased."
        />

        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <li key={feature.title}>
              <Reveal delay={(i % 3) * 60} className="h-full">
                <Card className="group relative h-full gap-4 overflow-hidden py-6 transition-all hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10 motion-reduce:hover:translate-y-0">
                  {/* Brand wash that fades in on hover. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand/8 via-transparent to-brand-accent/8 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <CardContent className="relative space-y-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong to-brand text-brand-foreground shadow-sm shadow-brand/25 transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100">
                      <feature.icon className="size-5" aria-hidden />
                    </div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="text-sm text-pretty text-muted-foreground">
                      {feature.description}
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
