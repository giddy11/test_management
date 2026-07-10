import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/shared/FormField"
import { PasswordField } from "@/components/shared/PasswordField"
import { GoogleButton } from "@/components/auth/GoogleButton"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { useLogin } from "@/hooks/useAuth"
import { loginSchema, type LoginForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"

export default function LoginPage() {
  const login = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = (values: LoginForm) => {
    login.mutate(values, {
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Login failed"),
    })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            Test<span className="text-primary">Mate</span>
          </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              data-cy="login-email"
              error={errors.email?.message}
              {...register("email")}
            />
            <PasswordField
              id="password"
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              data-cy="login-password"
              error={errors.password?.message}
              {...register("password")}
            />
            <div className="-mt-1 flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending} data-cy="login-submit">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4">
            <GoogleButton />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
