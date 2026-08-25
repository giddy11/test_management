// components/landing/ShowcaseSection.tsx — a tour of the real product, driven by
// the same screenshots the documentation uses. Built on the app's own Tabs
// primitive, so the tab list is keyboard-navigable for free.
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import {
  BrowserFrame,
  PhoneFrame,
  ProductShot,
} from "@/components/landing/DeviceFrame"
import { Card, CardContent } from "@/components/ui/card"
import {
  DASHBOARD,
  DASHBOARD_BENEFITS,
  SHOWCASES,
} from "@/components/landing/content"

export function ShowcaseSection() {
  return (
    <section
      id="product"
      aria-labelledby="product-heading"
      /* overflow-hidden clips the glow, which is deliberately wider than the
         frame it sits behind and would otherwise widen the page on mobile. */
      className="scroll-mt-16 overflow-hidden border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="product-heading"
          eyebrow={DASHBOARD.eyebrow}
          title={DASHBOARD.title}
          lead={DASHBOARD.lead}
        />

        <Reveal className="mt-12">
          <Tabs defaultValue={SHOWCASES[0].value} className="gap-8">
            {/* The list is centred by this wrapper rather than by `items-center`
                on Tabs: as a stretched flex child it stays inside the page, so
                the list scrolls internally instead of widening the document. */}
            <div className="flex justify-center">
              <TabsList
                aria-label="Product screens"
                className="border border-brand/15 bg-brand-soft/50 dark:bg-brand-soft/25"
              >
                {SHOWCASES.map((shot) => (
                  <TabsTrigger
                    key={shot.value}
                    value={shot.value}
                    className="data-[state=active]:text-brand dark:data-[state=active]:text-brand"
                  >
                    {shot.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {SHOWCASES.map((shot) => (
              <TabsContent key={shot.value} value={shot.value} className="w-full">
                <figure className="relative isolate mx-auto max-w-5xl">
                  <div
                    aria-hidden
                    className="absolute -inset-x-6 -top-4 bottom-10 -z-10 rounded-[3rem] bg-linear-to-r from-brand/25 via-brand-accent/20 to-brand/25 blur-3xl"
                  />
                  {shot.mobile ? (
                    <PhoneFrame>
                      <ProductShot
                        src={shot.src}
                        width={shot.width}
                        height={shot.height}
                        alt={shot.caption}
                      />
                    </PhoneFrame>
                  ) : (
                    <BrowserFrame path={shot.path}>
                      <ProductShot
                        src={shot.src}
                        width={shot.width}
                        height={shot.height}
                        alt={shot.caption}
                      />
                    </BrowserFrame>
                  )}
                  <figcaption className="mt-4 text-center text-sm text-muted-foreground">
                    {shot.caption}
                  </figcaption>
                </figure>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>

        {/* The "why" behind the dashboard — deck, "Key Benefits". */}
        <ul className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {DASHBOARD_BENEFITS.map((benefit, i) => (
            <li key={benefit.title}>
              <Reveal delay={i * 60} className="h-full">
                <Card className="h-full gap-4 border-brand/15 py-6">
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex size-7 items-center justify-center rounded-md bg-brand-soft text-brand dark:bg-brand-soft/40"
                        aria-hidden
                      >
                        <benefit.icon className="size-4" />
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="font-semibold text-balance">{benefit.title}</h3>
                    <p className="text-sm text-pretty text-muted-foreground">
                      {benefit.description}
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
