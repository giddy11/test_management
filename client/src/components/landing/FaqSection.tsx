// components/landing/FaqSection.tsx — the questions the documentation's FAQ
// answers, in an accordion.
import { Link } from "react-router-dom"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { FAQS } from "@/components/landing/content"

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="faq-heading"
          eyebrow="FAQ"
          title="Questions people ask first"
          lead="Longer answers, and everything else, live in the documentation."
        />

        <Reveal className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible data-cy="landing-faq">
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.question} value={`faq-${i}`}>
                <AccordionTrigger className="text-base">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pr-8 text-pretty text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Still deciding?{" "}
            <Link to="/docs" className="font-medium text-brand hover:underline">
              Read the full documentation
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  )
}
