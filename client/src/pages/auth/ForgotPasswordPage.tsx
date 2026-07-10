import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/shared/FormField"
import { AuthShell } from "@/components/auth/AuthShell"
import { useForgotPassword } from "@/hooks/useAuthFlows"
import { forgotPasswordSchema, type ForgotPasswordForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = ({ email }: ForgotPasswordForm) => {
    forgot.mutate(email, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
      onSuccess: () => {
        toast.success("If that email exists, a reset code has been sent")
        navigate("/reset-password", { state: { email } })
      },
    })
  }

  return (
    <AuthShell
      title="Forgot password"
      description="Enter your email and we'll send a reset code"
    >
      <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          data-cy="forgot-email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" className="w-full" disabled={forgot.isPending} data-cy="forgot-submit">
          {forgot.isPending ? "Sending…" : "Send reset code"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
