// components/live-chat-widget/LiveChatAuthForm.tsx
// The opt-in alternative to PreChatForm: shown when the project requires a
// real TestMate account for this widget (LiveChatWidgetConfig.requireAccount)
// instead of a free-form name/email/phone. Toggles between login and signup
// in place rather than being two separate views.
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordField } from "@/components/shared/PasswordField"
import { PhoneInput } from "@/components/shared/PhoneInput"

interface Props {
  pending: boolean
  error: string | null
  onLogin: (data: { email: string; password: string }) => void
  onRegister: (data: { name: string; email: string; password: string; phone?: string }) => void
}

export function LiveChatAuthForm({ pending, error, onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState<string | undefined>(undefined)
  // Once a login/signup attempt fails, the error stays visible until the
  // visitor edits email or password — editing means they're taking another
  // shot at it, so the stale "Invalid email or password" shouldn't still be
  // sitting there under a field they haven't touched yet.
  const [errorDismissed, setErrorDismissed] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    setErrorDismissed(false)
    if (mode === "login") {
      onLogin({ email: email.trim(), password })
    } else {
      onRegister({ name: name.trim(), email: email.trim(), password, phone })
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-right text-[0.7rem] text-muted-foreground">Live chat by TestMate</p>
      <div>
        <h3 className="text-sm font-semibold">{mode === "login" ? "Log in to chat" : "Create an account"}</h3>
        <p className="text-xs text-muted-foreground">
          {mode === "login"
            ? "Sign in to pick up where you left off."
            : "Sign up to start chatting — you'll be able to log back in from any device."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="lcaf-name">Your name</Label>
            <Input
              id="lcaf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="lcaf-email">Email</Label>
          <Input
            id="lcaf-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrorDismissed(true)
            }}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-1.5">
          <PasswordField
            id="lcaf-password"
            label="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setErrorDismissed(true)
            }}
            placeholder="••••••••"
            required
            minLength={mode === "signup" ? 8 : undefined}
          />
          {mode === "signup" && (
            <p className="text-[0.65rem] text-muted-foreground">
              At least 8 characters, with an uppercase letter and a number.
            </p>
          )}
        </div>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="lcaf-phone">Your phone (optional)</Label>
            <PhoneInput id="lcaf-phone" value={phone} onChange={setPhone} />
          </div>
        )}

        {error && !errorDismissed && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {mode === "login" ? "Log in" : "Sign up"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
      >
        {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  )
}
