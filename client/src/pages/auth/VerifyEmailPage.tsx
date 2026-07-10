import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Navigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/shared/FormField"
import { AuthShell } from "@/components/auth/AuthShell"
import { useAuth } from "@/contexts/AuthContext"
import { useVerifyEmail, useResendVerification } from "@/hooks/useAuthFlows"
import { otpCodeSchema, type OtpCodeForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"

export default function VerifyEmailPage() {
  const { user } = useAuth()
  const location = useLocation()
  const stateEmail = (location.state as { email?: string } | null)?.email
  const email = user?.email ?? stateEmail

  const verify = useVerifyEmail()
  const resend = useResendVerification()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpCodeForm>({ resolver: zodResolver(otpCodeSchema) })

  // Already verified (or arrived with no context) — bounce away.
  if (user?.isEmailVerified) return <Navigate to="/dashboard" replace />
  if (!email) return <Navigate to="/login" replace />

  const onSubmit = ({ code }: OtpCodeForm) => {
    verify.mutate(
      { email, code },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : "Verification failed") }
    )
  }

  const onResend = () => {
    resend.mutate(email, {
      onSuccess: () => toast.success("A new code has been sent"),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not resend"),
    })
  }

  return (
    <AuthShell
      title="Verify your email"
      description={
        <>
          Enter the 6-digit code we sent to <span className="font-medium">{email}</span>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="code"
          label="Verification code"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          error={errors.code?.message}
          {...register("code")}
        />
        <Button type="submit" className="w-full" disabled={verify.isPending} data-cy="verify-submit">
          {verify.isPending ? "Verifying…" : "Verify email"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Didn't get it?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={resend.isPending}
          data-cy="verify-resend"
          className="font-medium text-primary hover:underline disabled:opacity-50"
        >
          Resend code
        </button>
      </p>
    </AuthShell>
  )
}
