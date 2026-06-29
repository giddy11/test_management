import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/shared/FormField"
import { PasswordField } from "@/components/shared/PasswordField"
import { AuthShell } from "@/components/auth/AuthShell"
import { useResetPassword } from "@/hooks/useAuthFlows"
import { resetPasswordSchema, type ResetPasswordForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"

export default function ResetPasswordPage() {
  const reset = useResetPassword()
  const navigate = useNavigate()
  const location = useLocation()
  const presetEmail = (location.state as { email?: string } | null)?.email ?? ""

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: presetEmail },
  })

  const onSubmit = (values: ResetPasswordForm) => {
    reset.mutate(
      { email: values.email, code: values.code, newPassword: values.newPassword },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Reset failed"),
        onSuccess: () => {
          toast.success("Password reset — sign in with your new password")
          navigate("/login", { replace: true })
        },
      }
    )
  }

  return (
    <AuthShell title="Reset password" description="Enter the code and your new password">
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="code"
          label="Reset code"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          error={errors.code?.message}
          {...register("code")}
        />
        <PasswordField
          id="newPassword"
          label="New password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? "Resetting…" : "Reset password"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
