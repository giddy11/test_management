// components/subscription/SubscriptionRequiredModal.tsx — covers the app when
// the organisation has no subscription, or its trial or paid period has ended.
// It can't be closed: the only ways out are subscribing (the platform owner
// then sets the plan) or signing out. Nothing is deleted while it's locked.
//
// The platform owner is never locked out by a customer plan. This is the
// experience; the server keeps enforcing Free's limits regardless.
import { useNavigate } from "react-router-dom"
import { Lock, Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CONTACT } from "@/components/landing/content"
import { useAuth } from "@/contexts/AuthContext"
import { useMyPlan } from "@/hooks/useSubscription"
import { PLAN_NAMES, formatDate } from "@/lib/planStatus"

export function SubscriptionRequiredModal() {
  const { can, clearSession } = useAuth()
  const navigate = useNavigate()
  const { data: plan } = useMyPlan()

  if (!plan?.blocked || can("platform.read")) return null

  const isAdmin = can("user.create") || can("role.manage")
  const wasTrial = plan.status === "expired" && !!plan.trialEndsAt && !plan.paidUntil
  const ended = plan.status === "expired" ? (wasTrial ? plan.trialEndsAt : plan.paidUntil) : null
  const title =
    plan.status === "none"
      ? "Your organisation doesn't have a subscription yet"
      : `Your ${PLAN_NAMES[plan.assignedPlanKey]} ${wasTrial ? "trial" : "plan"} has ended`

  const signOut = () => {
    clearSession()
    navigate("/login", { replace: true })
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
        data-cy="subscription-required"
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-500/15">
            <Lock className="size-5 text-amber-600" aria-hidden />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              {ended && <p>It ended on {formatDate(ended)}.</p>}
              {isAdmin ? (
                <p>
                  To keep using ServiceDesk4u, subscribe to a plan. Contact us and we&apos;ll switch it on as soon as your
                  payment is confirmed.
                </p>
              ) : (
                <p>Ask your organisation&apos;s administrator to {plan.status === "none" ? "set up" : "renew"} the subscription.</p>
              )}
              <p>Nothing has been deleted: everything is still there when the subscription is active.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {isAdmin && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 font-medium text-brand hover:underline">
              <Mail className="size-4" aria-hidden /> {CONTACT.email}
            </a>
            <a href={CONTACT.phoneHref} className="flex items-center gap-2 font-medium text-brand hover:underline">
              <Phone className="size-4" aria-hidden /> {CONTACT.phone}
            </a>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={signOut} data-cy="subscription-required-sign-out">
            Sign out
          </Button>
          {isAdmin && (
            <Button asChild>
              <a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Subscribe to ServiceDesk4u")}`}>Email us</a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
