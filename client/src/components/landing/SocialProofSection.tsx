// components/landing/SocialProofSection.tsx — who TestMate is for, backed by
// capability facts rather than invented metrics. The customer logo strip and the
// testimonial grid render only when real entries exist in content.ts; both start
// empty on purpose, so nothing fictional ever ships.
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import {
  AUDIENCE_ROLES,
  CLIENT_LOGOS,
  PRODUCT_FACTS,
  TESTIMONIALS,
} from "@/components/landing/content"

export function SocialProofSection() {
  return (
    <section
      id="who-its-for"
      aria-labelledby="who-its-for-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        {CLIENT_LOGOS.length > 0 && (
          <Reveal className="mb-16">
            <p className="text-center text-sm text-muted-foreground">
              Teams running their testing on TestMate
            </p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
              {CLIENT_LOGOS.map((logo) => (
                <li key={logo.name}>
                  <img
                    src={logo.src}
                    alt={logo.name}
                    loading="lazy"
                    className="h-7 w-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
                  />
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        <SectionHeading
          id="who-its-for-heading"
          eyebrow="Who it is for"
          title="Every role in the loop, in one workspace"
          lead="From the tester writing a case to the customer reporting a problem, everyone works in the same place — each seeing exactly their slice of it."
        />

        <dl className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {PRODUCT_FACTS.map((fact, i) => (
            <Reveal key={fact.label} delay={i * 60} className="text-center">
              <dt className="bg-linear-to-br from-brand-strong via-brand to-brand-accent bg-clip-text text-5xl font-semibold tracking-tight tabular-nums text-transparent">
                {fact.value}
              </dt>
              <dd className="mt-2 text-sm text-pretty text-muted-foreground">
                {fact.label}
              </dd>
            </Reveal>
          ))}
        </dl>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_ROLES.map((role, i) => (
            <Reveal key={role.title} delay={i * 60}>
              <Card className="h-full gap-4 border-brand/15 bg-linear-to-b from-brand-soft/40 to-card py-6 transition-shadow hover:shadow-md hover:shadow-brand/10 dark:from-brand-soft/20">
                <CardContent className="space-y-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-brand/20 bg-background text-brand">
                    <role.icon className="size-4.5" aria-hidden />
                  </div>
                  <h3 className="font-semibold">{role.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {role.description}
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        {TESTIMONIALS.length > 0 && (
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial, i) => (
              <Reveal key={testimonial.author} delay={i * 60}>
                <Card className="h-full py-6">
                  <CardContent className="flex h-full flex-col gap-4">
                    <blockquote className="flex-1 text-sm text-pretty">
                      {testimonial.quote}
                    </blockquote>
                    <footer className="text-sm">
                      <span className="font-medium">{testimonial.author}</span>
                      <span className="block text-muted-foreground">
                        {testimonial.role}
                      </span>
                    </footer>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
