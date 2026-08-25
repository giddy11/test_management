// components/landing/SecuritySection.tsx — from the TestMate overview deck
// ("Security and Major Platform Reliability"). The four supporting points are
// the controls the application actually implements.
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { SECURITY, SECURITY_POINTS } from "@/components/landing/content"

export function SecuritySection() {
  return (
    <section
      id="security"
      aria-labelledby="security-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="security-heading"
          eyebrow={SECURITY.eyebrow}
          title={SECURITY.title}
          lead={SECURITY.lead}
        />

        <ul className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2">
          {SECURITY_POINTS.map((point, i) => (
            <li key={point.title}>
              <Reveal delay={(i % 2) * 60} className="h-full">
                <Card className="h-full gap-4 py-6">
                  <CardContent className="flex gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong to-brand text-brand-foreground shadow-sm shadow-brand/25">
                      <point.icon className="size-5" aria-hidden />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-semibold">{point.title}</h3>
                      <p className="text-sm text-pretty text-muted-foreground">
                        {point.description}
                      </p>
                    </div>
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
