import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { User, Lock, LifeBuoy, MessagesSquare, Power, PowerOff, Bell, BellOff, ShieldCheck } from "lucide-react"
import { Country, State, City } from "country-state-city"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"
import { useGuideTour } from "@/hooks/useGuideTour"
import { useUpdateOnboardingStatus } from "@/hooks/useOnboarding"
import { useUpdateNotificationSoundSetting } from "@/hooks/useNotificationSoundSetting"
import { useProjects } from "@/hooks/useProjects"
import { ALL_GUIDES, DASHBOARD_GUIDE, type TourGuide } from "@/lib/tourGuides"
import { Badge } from "@/components/ui/badge"
import { type ChangePasswordPayload, type UpdateProfilePayload } from "@/types/auth.types"
import { useSupportChatSettings, useSetSupportChatEnabled } from "@/hooks/useSupportChat"
import { RolesAccessTab } from "@/components/access/RolesAccessTab"

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isDirty },
  } = useForm<UpdateProfilePayload>({
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      email: user?.email ?? "",
      address: user?.address ?? "",
      city: user?.city ?? "",
      state: user?.state ?? "",
      country: user?.country ?? "",
    },
  })

  const countryName = watch("country")
  const stateName = watch("state")
  const cityName = watch("city")

  // Country/state/city names are stored as free text, so an existing value
  // that doesn't match the library's canonical name (e.g. entered before this
  // dropdown existed) is kept as a selectable option instead of disappearing.
  const countries = useMemo(() => {
    const list = Country.getAllCountries()
    if (countryName && !list.some((c) => c.name === countryName)) {
      return [{ name: countryName, isoCode: "" }, ...list]
    }
    return list
  }, [countryName])

  const selectedCountry = countries.find((c) => c.name === countryName)

  const states = useMemo(() => {
    const list = selectedCountry?.isoCode ? State.getStatesOfCountry(selectedCountry.isoCode) : []
    if (stateName && !list.some((s) => s.name === stateName)) {
      return [{ name: stateName, isoCode: "", countryCode: selectedCountry?.isoCode ?? "" }, ...list]
    }
    return list
  }, [selectedCountry, stateName])

  const selectedState = states.find((s) => s.name === stateName)

  const cities = useMemo(() => {
    const raw = selectedState?.isoCode && selectedCountry?.isoCode
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : selectedCountry?.isoCode
        ? (City.getCitiesOfCountry(selectedCountry.isoCode) ?? [])
        : []
    // The same city name can appear under multiple states/regions (e.g. Nigeria
    // has two towns named "Daura") — dedupe by name since only the name is stored.
    const list = Array.from(new Map(raw.map((c) => [c.name, c])).values())
    if (cityName && !list.some((c) => c.name === cityName)) {
      return [{ name: cityName, countryCode: "", stateCode: "" }, ...list]
    }
    return list
  }, [selectedCountry, selectedState, cityName])

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

  const update = useMutation({
    mutationFn: (payload: UpdateProfilePayload) => AuthEndpoints.updateProfile(payload),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message)
        return
      }
      qc.invalidateQueries({ queryKey: ["auth", "me"] })
      toast.success("Profile updated")
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to update profile"),
  })

  const onSubmit = (data: UpdateProfilePayload) => {
    const patch: UpdateProfilePayload = {}
    if (data.firstName) patch.firstName = data.firstName
    if (data.lastName) patch.lastName = data.lastName
    if (data.email) patch.email = data.email
    if (data.address !== undefined) patch.address = data.address || null
    if (data.city !== undefined) patch.city = data.city || null
    if (data.state !== undefined) patch.state = data.state || null
    if (data.country !== undefined) patch.country = data.country || null
    update.mutate(patch)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Update your name and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register("lastName")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={user?.email ?? ""}
              readOnly
              className="cursor-default bg-muted text-muted-foreground select-none"
            />
            <p className="text-xs text-muted-foreground">
              Email address cannot be changed. Contact your administrator.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="address">Street address</Label>
            <Input id="address" {...register("address")} placeholder="Optional" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Select value={cityName || undefined} onValueChange={handleCityChange} disabled={!selectedCountry}>
                <SelectTrigger id="city" className="w-full">
                  <SelectValue placeholder={selectedCountry ? "Optional" : "Select a country first"} />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State / Province</Label>
              <Select value={stateName || undefined} onValueChange={handleStateChange} disabled={!selectedCountry}>
                <SelectTrigger id="state" className="w-full">
                  <SelectValue placeholder={selectedCountry ? "Optional" : "Select a country first"} />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.isoCode || s.name} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Select value={countryName || undefined} onValueChange={handleCountryChange}>
                <SelectTrigger id="country" className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.isoCode || c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending || !isDirty} data-cy="profile-save">
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const { user, clearSession } = useAuth()
  const [confirmNew, setConfirmNew] = useState("")

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordPayload & { confirmPassword: string }>()

  const newPassword = watch("newPassword")

  const change = useMutation({
    mutationFn: (payload: ChangePasswordPayload) => AuthEndpoints.changePassword(payload),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success("Password changed. Please log in again.")
      reset()
      setConfirmNew("")
      // All refresh tokens revoked server-side — clear local session.
      setTimeout(() => clearSession(), 1500)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to change password"),
  })

  const onSubmit = (data: ChangePasswordPayload & { confirmPassword: string }) => {
    // The confirm field is controlled state, not registered with the form —
    // compare against it directly (data.confirmPassword is always undefined).
    if (data.newPassword !== confirmNew) {
      toast.error("New passwords do not match")
      return
    }
    change.mutate({ currentPassword: data.currentPassword, newPassword: data.newPassword })
  }

  const isOAuth = user?.provider !== "local"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            {isOAuth
              ? "Password changes are not available for accounts using Google Sign-In."
              : "You will be logged out everywhere after changing your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOAuth ? (
            <p className="text-sm text-muted-foreground">
              Your account uses Google Sign-In. To update your password, manage it through your Google account.
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...register("currentPassword", { required: true })}
                />
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("newPassword", {
                    required: true,
                    minLength: { value: 8, message: "At least 8 characters" },
                    validate: {
                      uppercase: (v) => /[A-Z]/.test(v) || "Must contain an uppercase letter",
                      number: (v) => /[0-9]/.test(v) || "Must contain a number",
                    },
                  })}
                />
                {errors.newPassword && (
                  <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmNew}
                  onChange={(e) => setConfirmNew(e.target.value)}
                />
                {confirmNew && newPassword !== confirmNew && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={change.isPending || !confirmNew || newPassword !== confirmNew}
                  data-cy="password-submit"
                >
                  {change.isPending ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Help tab ──────────────────────────────────────────────────────────────────

function HelpTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const updateStatus = useUpdateOnboardingStatus()
  const { startTour } = useGuideTour()
  const { data: projectsData } = useProjects({ page: 1, limit: 1 })
  const hasProject = (projectsData?.data.length ?? 0) > 0

  const guides = ALL_GUIDES.filter((g) => !g.roles || (user && g.roles.includes(user.role)))

  const handleStart = (guide: TourGuide) => {
    const onComplete = guide.id === DASHBOARD_GUIDE.id ? () => updateStatus.mutate(true) : undefined
    if (guide.requiresProject) {
      const first = projectsData?.data[0]
      if (!first) {
        toast.error("Create a project first")
        return
      }
      navigate(`/projects/${first.id}`)
    }
    startTour(guide, onComplete)
  }

  if (guides.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <LifeBuoy className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No guides available for your role yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {guides.map((guide) => {
        const disabled = Boolean(guide.requiresProject) && !hasProject
        return (
          <Card key={guide.id}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <guide.icon className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-base">{guide.title}</CardTitle>
                <CardDescription>{guide.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button onClick={() => handleStart(guide)} disabled={disabled} variant="outline">
                {disabled ? "Create a project first" : "Start"}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const { user } = useAuth()
  const updateSound = useUpdateNotificationSoundSetting()
  const enabled = user?.notificationSoundEnabled ?? true

  const toggle = () => {
    const next = !enabled
    updateSound.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "Notification sound turned on" : "Notification sound turned off"),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Couldn't update the setting"),
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Alert sound
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
              </CardTitle>
              <CardDescription>
                Play a sound when a new notification or support chat message arrives.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={toggle}
            disabled={updateSound.isPending}
            data-cy="notification-sound-toggle"
          >
            {enabled ? (
              <>
                <BellOff className="size-4" /> Turn off
              </>
            ) : (
              <>
                <Bell className="size-4" /> Turn on
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Admin tab (superadmin only) ─────────────────────────────────────────────────

function AdminTab() {
  const { data: settings, isLoading } = useSupportChatSettings()
  const setEnabled = useSetSupportChatEnabled()
  const enabled = settings?.enabled ?? true

  const toggle = () => {
    const next = !enabled
    setEnabled.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "Support chat enabled for users" : "Support chat disabled for users"),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Couldn't update the setting"),
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Support chat
                {!isLoading && (
                  <Badge variant={enabled ? "default" : "secondary"}>
                    {enabled ? "On" : "Off"}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                The floating chat widget users use to message the admin team. When off, the widget is
                hidden for everyone and new messages are blocked. Existing conversations stay in the
                support inbox.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={toggle} disabled={isLoading || setEnabled.isPending}>
            {enabled ? (
              <>
                <PowerOff className="size-4" /> Disable for users
              </>
            ) : (
              <>
                <Power className="size-4" /> Enable for users
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { can } = useAuth()
  // The Admin tab holds the platform-wide support-chat toggle.
  const isSuperadmin = can("settings.manage")
  // Reading roles is its own permission; managing them is another. The tab
  // shows for anyone who may look, and the editor stays read-only without
  // role.manage. The API enforces both regardless.
  const canReadRoles = can("role.read")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, contact details, and account security.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5" data-cy="settings-tab-profile">
            <User className="size-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5" data-cy="settings-tab-security">
            <Lock className="size-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="help" className="gap-1.5" data-cy="settings-tab-help">
            <LifeBuoy className="size-3.5" />
            Help
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5" data-cy="settings-tab-notifications">
            <Bell className="size-3.5" />
            Notifications
          </TabsTrigger>
          {canReadRoles && (
            <TabsTrigger value="access" className="gap-1.5" data-cy="settings-tab-access">
              <ShieldCheck className="size-3.5" />
              Roles & access
            </TabsTrigger>
          )}
          {isSuperadmin && (
            <TabsTrigger value="admin" className="gap-1.5" data-cy="settings-tab-admin">
              <MessagesSquare className="size-3.5" />
              Admin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>

        <TabsContent value="help" className="mt-4">
          <HelpTab />
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>

        {canReadRoles && (
          <TabsContent value="access" className="mt-4">
            <RolesAccessTab />
          </TabsContent>
        )}

        {isSuperadmin && (
          <TabsContent value="admin" className="mt-4">
            <AdminTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
