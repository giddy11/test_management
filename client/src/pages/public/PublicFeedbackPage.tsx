// Public, unauthenticated feedback form — reached via a project's shareable
// /feedback/<token> link, typically embedded in the company's own application.
import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, MessageSquareHeart } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PhoneInput } from "@/components/shared/PhoneInput"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import { FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/types/feedback.types"

const MAX_IMAGES = 5

export default function PublicFeedbackPage() {
  const { token = "" } = useParams()
  const [type, setType] = useState<FeedbackType>("feature_request")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [suiteName, setSuiteName] = useState("")
  const [images, setImages] = useState<File[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const { data: form, isLoading, isError } = useQuery({
    queryKey: ["public-feedback-form", token],
    queryFn: async () => {
      const res = await FeedbackEndpoints.publicForm(token)
      if (!res.success || !res.data) throw new Error(res.message)
      return res.data
    },
    enabled: Boolean(token),
    retry: false,
  })

  const addImages = (files: FileList | null) => {
    if (!files) return
    setImages((prev) => [...prev, ...Array.from(files)].slice(0, MAX_IMAGES))
  }

  const resetForm = () => {
    setType("feature_request")
    setTitle("")
    setDescription("")
    setSuiteName("")
    setImages([])
    setDone(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await FeedbackEndpoints.publicSubmit(token, {
        type,
        title,
        description,
        suiteName: suiteName || undefined,
        submitterName: name,
        submitterEmail: email,
        submitterPhone: phone,
        images,
      })
      if (res.success) setDone(true)
      else toast.error(res.message || "Submission failed — please try again")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Submission failed — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        {isLoading ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        ) : isError || !form ? (
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium">This ticket form is not available.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The link may have been disabled — please contact the team that shared it with you.
            </p>
          </CardContent>
        ) : done ? (
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto size-10 text-green-600" />
            <p className="mt-3 text-base font-semibold">Thank you!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your ticket for {form.projectName} has been logged. We've emailed you a
              confirmation at <span className="font-medium">{email}</span> and will keep you
              posted as it progresses.
            </p>
            <Button variant="outline" className="mt-6" onClick={resetForm}>
              Submit another response
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareHeart className="size-5 text-primary" />
                {form.projectName} — Raise a Ticket
              </CardTitle>
              <CardDescription>
                Spotted a bug, want a feature, or have a concern? Tell the team — you'll get
                email updates as they work on it.
                {form.clientCompanyName && (
                  <> Your report goes to <strong>{form.clientCompanyName}</strong>'s IT support team first.</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="fb-name">Your name</Label>
                    <Input id="fb-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="fb-email">Your email</Label>
                    <Input id="fb-email" type="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="fb-phone">Phone number (optional)</Label>
                  <PhoneInput id="fb-phone" value={phone} onChange={setPhone} />
                </div>

                <div className="grid gap-1.5">
                  <Label>What kind of ticket?</Label>
                  <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FEEDBACK_TYPE_LABELS) as FeedbackType[]).map((t) => (
                        <SelectItem key={t} value={t}>{FEEDBACK_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(type === "feature_request" || type === "bug") && form.suites.length > 0 && (
                  <div className="grid gap-1.5">
                    <Label>Which part of the application? (optional)</Label>
                    <Select
                      value={suiteName || "none"}
                      onValueChange={(v) => setSuiteName(v === "none" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Not sure" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not sure</SelectItem>
                        {form.suites.map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label htmlFor="fb-title">Title</Label>
                  <Input id="fb-title" required maxLength={200} placeholder="Short summary" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="fb-description">Details</Label>
                  <Textarea
                    id="fb-description"
                    required
                    maxLength={5000}
                    rows={5}
                    placeholder="Describe it as precisely as you can — what happened, what you expected, or what you'd like to see."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="fb-images">Screenshots (optional, up to {MAX_IMAGES})</Label>
                  <Input
                    id="fb-images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={(e) => {
                      addImages(e.target.files)
                      e.target.value = ""
                    }}
                  />
                  {images.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {images.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative">
                          <img
                            src={URL.createObjectURL(f)}
                            alt={f.name}
                            className="size-16 rounded-md border object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                            onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Raise ticket"}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
