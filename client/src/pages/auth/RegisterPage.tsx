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
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { useRegister } from "@/hooks/useAuth"
import { registerSchema, type RegisterForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { RegisterPayload } from "@/types/auth.types"

export default function RegisterPage() {
  const registerMut = useRegister()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const onSubmit = (values: RegisterForm) => {
    // Drop empty optional strings before sending.
    const payload: RegisterPayload = {
      firstName: values.firstName,
      lastName: values.lastName,
      companyName: values.companyName,
      email: values.email,
      password: values.password,
      address: values.address || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      country: values.country || undefined,
    }
    registerMut.mutate(payload, {
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Registration failed"),
      onSuccess: () => toast.success("Account created — verification code sent to your email"),
    })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your organisation</CardTitle>
          <CardDescription>
            Register your company on Test<span className="text-primary">Mate</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                id="firstName"
                label="First name"
                error={errors.firstName?.message}
                {...register("firstName")}
              />
              <FormField
                id="lastName"
                label="Last name"
                error={errors.lastName?.message}
                {...register("lastName")}
              />
            </div>
            <FormField
              id="companyName"
              label="Company name"
              error={errors.companyName?.message}
              {...register("companyName")}
            />
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <PasswordField
              id="password"
              label="Password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register("password")}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField id="city" label="City (optional)" {...register("city")} />
              <FormField id="country" label="Country (optional)" {...register("country")} />
            </div>
            <Button type="submit" className="w-full" disabled={registerMut.isPending}>
              {registerMut.isPending ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
