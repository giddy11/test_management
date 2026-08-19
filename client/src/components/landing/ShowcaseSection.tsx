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
import { SHOWCASES } from "@/components/landing/content"

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
          eyebrow="Product tour"
          title="See the parts you will actually live in"
          lead="Every screen below is the shipping product, not a rendering."
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
      </div>
    </section>
  )
}
