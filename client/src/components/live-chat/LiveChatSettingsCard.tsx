// components/live-chat/LiveChatSettingsCard.tsx
// Enable/disable the embeddable widget for this project and configure its
// branding — mirrors FeedbackTab's public-form-link card (same enable/copy/
// disable pattern), plus a small form for the widget's presentation.
import { useEffect, useState } from "react"
import { Copy, Link2, Link2Off, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useProject } from "@/hooks/useProjects"
import { useLiveChatSettings, useUpdateLiveChatSettings, useSetLiveChatLink } from "@/hooks/useLiveChatInbox"
import { ApiError } from "@/transport/http"

interface Props {
  projectId: string
}

export function LiveChatSettingsCard({ projectId }: Props) {
  const { data: project } = useProject(projectId)
  const { data: settings } = useLiveChatSettings(projectId)
  const updateSettings = useUpdateLiveChatSettings()
  const setLink = useSetLiveChatLink()

  const [displayName, setDisplayName] = useState("")
  const [greetingMessage, setGreetingMessage] = useState("")
  const [offlineMessage, setOfflineMessage] = useState("")
  const [brandColor, setBrandColor] = useState("")

  // Seed the form once settings load — a ref-free flag so a later refetch
  // (e.g. after Save) doesn't clobber further in-progress edits.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (settings && !seeded) {
      setDisplayName(settings.displayName ?? "")
      setGreetingMessage(settings.greetingMessage ?? "")
      setOfflineMessage(settings.offlineMessage ?? "")
      setBrandColor(settings.brandColor ?? "")
      setSeeded(true)
    }
  }, [settings, seeded])

  const embedToken = project?.liveChatToken ?? null
  const snippet = embedToken
    ? `<script async src="${window.location.origin}/live-chat-widget.js" data-token="${embedToken}"></script>`
    : null

  const toggleLink = (enabled: boolean) => {
    setLink.mutate(
      { projectId, enabled },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: ({ liveChatToken }) =>
          toast.success(liveChatToken ? "Live chat widget enabled" : "Live chat widget disabled"),
      }
    )
  }

  const copySnippet = () => {
    if (!snippet) return
    navigator.clipboard.writeText(snippet)
    toast.success("Embed snippet copied — paste it into your site")
  }

  const toggleRequireAccount = (value: boolean) => {
    updateSettings.mutate(
      { projectId, requireAccount: value },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () =>
          toast.success(
            value ? "Visitors must now log in to chat" : "Visitors can chat without an account again"
          ),
      }
    )
  }

  const saveBranding = () => {
    updateSettings.mutate(
      {
        projectId,
        displayName: displayName.trim() || null,
        greetingMessage: greetingMessage.trim() || null,
        offlineMessage: offlineMessage.trim() || null,
        brandColor: brandColor.trim() || null,
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => toast.success("Widget settings saved"),
      }
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-primary" /> Live chat widget
        </CardTitle>
        <CardDescription>
          Embed a live chat widget on your own website so visitors can talk to your team in real
          time — no account needed on their end.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {snippet ? (
            <>
              <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{snippet}</code>
              <Button size="sm" variant="outline" onClick={copySnippet}>
                <Copy className="mr-1 size-3.5" /> Copy snippet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleLink(false)} disabled={setLink.isPending}>
                <Link2Off className="mr-1 size-3.5" /> Disable
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => toggleLink(true)} disabled={setLink.isPending}>
              <Link2 className="mr-1 size-3.5" /> Enable live chat
            </Button>
          )}
        </div>

        {embedToken && (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Require a TestMate account to chat</p>
                <p className="text-xs text-muted-foreground">
                  Visitors log in or sign up instead of filling out a contact form — lets them pick up
                  their conversation from any device.
                </p>
              </div>
              <Button
                size="sm"
                variant={settings?.requireAccount ? "default" : "outline"}
                onClick={() => toggleRequireAccount(!settings?.requireAccount)}
                disabled={updateSettings.isPending}
              >
                {settings?.requireAccount ? "Required" : "Optional"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lc-display-name">Display name</Label>
              <Input
                id="lc-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={project?.name ?? "Chat"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lc-brand-color">Brand color</Label>
              <Input
                id="lc-brand-color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#4f46e5"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lc-greeting">Greeting message</Label>
              <Textarea
                id="lc-greeting"
                rows={2}
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="Hi! How can we help?"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lc-offline">Offline message</Label>
              <Textarea
                id="lc-offline"
                rows={2}
                value={offlineMessage}
                onChange={(e) => setOfflineMessage(e.target.value)}
                placeholder="We're not online right now — leave a message and we'll get back to you."
              />
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" onClick={saveBranding} disabled={updateSettings.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
