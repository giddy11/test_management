// components/landing/SectionHeading.tsx — the eyebrow / title / lead block that
// opens every landing section. The `id` is what the section's aria-labelledby
// points at, so each <section> is announced by its own heading.
import { Reveal } from "@/components/landing/Reveal"
import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  id: string
  eyebrow: string
  title: string
  lead?: string
  align?: "center" | "left"
  className?: string
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <p
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft/60 px-3 py-1 text-xs font-semibold tracking-wide text-brand uppercase",
          align === "center" && "mx-auto",
        )}
      >
        <span className="size-1.5 rounded-full bg-brand" aria-hidden />
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
          {lead}
        </p>
      )}
    </Reveal>
  )
}
