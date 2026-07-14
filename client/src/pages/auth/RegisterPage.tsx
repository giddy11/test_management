import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Country, State, City } from "country-state-city"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const countryName = watch("country")
  const stateName = watch("state")
  const cityName = watch("city")

  const countries = useMemo(() => Country.getAllCountries(), [])
  const selectedCountry = countries.find((c) => c.name === countryName)

  const states = useMemo(
    () => (selectedCountry ? State.getStatesOfCountry(selectedCountry.isoCode) : []),
    [selectedCountry]
  )
  const selectedState = states.find((s) => s.name === stateName)

  const cities = useMemo(() => {
    const list = selectedState && selectedCountry
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : selectedCountry
        ? (City.getCitiesOfCountry(selectedCountry.isoCode) ?? [])
        : []
    // The same city name can appear under multiple states/regions (e.g. Nigeria
    // has two towns named "Daura") — dedupe by name since only the name is stored.
    return Array.from(new Map(list.map((c) => [c.name, c])).values())
  }, [selectedCountry, selectedState])

  const handleCountryChange = (name: string) => {
    setValue("country", name, { shouldDirty: true })
    setValue("state", "", { shouldDirty: true })
    setValue("city", "", { shouldDirty: true })
  }
  const handleStateChange = (name: string) => {
    setValue("state", name, { shouldDirty: true })
    setValue("city", "", { shouldDirty: true })
  }
  const handleCityChange = (name: string) => setValue("city", name, { shouldDirty: true })

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
            <div className="space-y-1.5">
              <Label htmlFor="country">Country (optional)</Label>
              <Select value={countryName || undefined} onValueChange={handleCountryChange}>
                <SelectTrigger id="country" className="w-full">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.isoCode} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="state">State / Province (optional)</Label>
                <Select value={stateName || undefined} onValueChange={handleStateChange} disabled={!selectedCountry}>
                  <SelectTrigger id="state" className="w-full">
                    <SelectValue placeholder={selectedCountry ? "Select a state" : "Select a country first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.isoCode} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City (optional)</Label>
                <Select value={cityName || undefined} onValueChange={handleCityChange} disabled={!selectedCountry}>
                  <SelectTrigger id="city" className="w-full">
                    <SelectValue placeholder={selectedCountry ? "Select a city" : "Select a country first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
