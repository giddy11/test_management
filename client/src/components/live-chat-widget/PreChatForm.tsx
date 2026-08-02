// components/live-chat-widget/PreChatForm.tsx
// Shown before the visitor's first message: captures name/email/phone so
// staff have a real identity to work with, not just an anonymous visitor id.
// Email is the only required field — name and phone are a nice-to-have.
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/shared/PhoneInput"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  pending: boolean
  onSubmit: (data: { name?: string; email: string; phone?: string }) => void
}

export function PreChatForm({ pending, onSubmit }: Props) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [touched, setTouched] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!emailValid || pending) return
    onSubmit({ name: name.trim() || undefined, email: email.trim(), phone })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4">
      <p className="text-right text-[0.7rem] text-muted-foreground">Live chat by TestMate</p>
      <div className="space-y-1.5">
        <Label htmlFor="pcf-name">Your name</Label>
        <Input id="pcf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pcf-email">Your email *</Label>
        <Input
          id="pcf-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={touched && !emailValid}
        />
        {touched && !emailValid && <p className="text-xs text-destructive">Enter a valid email</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pcf-phone">Your phone</Label>
        <PhoneInput id="pcf-phone" value={phone} onChange={setPhone} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        Send
      </Button>
    </form>
  )
}
