import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { User, Lock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"
import type { ChangePasswordPayload, UpdateProfilePayload } from "@/types/auth.types"

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const {
    register,
    handleSubmit,
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
              <Input id="city" {...register("city")} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State / Province</Label>
              <Input id="state" {...register("state")} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} placeholder="Optional" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending || !isDirty}>
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
    if (data.newPassword !== data.confirmPassword) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
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
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="size-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Lock className="size-3.5" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
