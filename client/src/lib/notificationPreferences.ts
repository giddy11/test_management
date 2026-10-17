// lib/notificationPreferences.ts — the app areas a user can mute in Settings →
// Notifications. Keys mirror server/modules/notification/domain/notificationPreferences.js.
import type { NotificationCategory, NotificationChannel, NotificationPreferences } from "@/types/auth.types"

export interface NotificationCategoryInfo {
  key: NotificationCategory
  label: string
  description: string
  // Channels this area actually sends on; the rest show as unavailable.
  channels: NotificationChannel[]
  // Any one of these permissions shows the row (usability only — the server
  // simply never sends what a user isn't part of).
  audience: string[]
}

export interface NotificationCategoryGroup {
  title: string
  categories: NotificationCategoryInfo[]
}

const BOTH: NotificationChannel[] = ["inApp", "email"]
const PROJECTS = ["project.read"]
const IT_REQUESTS = ["servicerequest.create", "servicedesk.work"]

export const NOTIFICATION_GROUPS: NotificationCategoryGroup[] = [
  {
    title: "Projects & testing",
    categories: [
      {
        key: "projects",
        label: "Project membership",
        description: "When someone adds you to a project.",
        channels: BOTH,
        audience: PROJECTS,
      },
      {
        key: "testing",
        label: "Test cases & runs",
        description: "When you're assigned a test case, or a test run in your project is completed.",
        channels: BOTH,
        audience: PROJECTS,
      },
      {
        key: "bugs",
        label: "Bugs",
        description: "New bugs, bugs assigned to you, status changes and new comments.",
        channels: BOTH,
        audience: PROJECTS,
      },
      {
        key: "featureRequests",
        label: "Feature requests",
        description: "New requests, requests assigned to you, status changes and comments on yours.",
        channels: BOTH,
        audience: PROJECTS,
      },
      {
        key: "feedback",
        label: "Product feedback",
        description:
          "New feedback from public forms, escalations from IT support, feedback assigned to you and replies from submitters.",
        channels: BOTH,
        audience: PROJECTS,
      },
    ],
  },
  {
    title: "Collaboration",
    categories: [
      {
        key: "mentions",
        label: "Mentions",
        description: "When someone @mentions you on a bug, feature request or ticket.",
        channels: BOTH,
        audience: [...PROJECTS, "supportqueue.read"],
      },
    ],
  },
  {
    title: "Support",
    categories: [
      {
        key: "supportQueue",
        label: "IT support queue",
        description:
          "New tickets in your company's queue, tickets assigned to you, replies from submitters and tickets the product team closed.",
        channels: BOTH,
        audience: ["supportqueue.read"],
      },
      {
        key: "liveChat",
        label: "Live chat",
        description: "Messages from visitors on your projects' website chat widget.",
        channels: ["inApp"],
        audience: PROJECTS,
      },
      {
        key: "supportChat",
        label: "Support chat",
        description: "New messages in the support inbox, and replies to messages you've sent to support.",
        // Only the support team gets email — and only when none of them is online.
        channels: BOTH,
        audience: ["supportchat.send", "supportchat.read"],
      },
    ],
  },
  {
    title: "IT requests",
    categories: [
      {
        key: "serviceDeskApprovals",
        label: "Approvals & escalations",
        description: "When a request is waiting on your approval, or a request runs past its service level.",
        channels: BOTH,
        audience: IT_REQUESTS,
      },
      {
        key: "serviceDeskUpdates",
        label: "Request updates",
        description: "Progress on requests you raised, are assigned or are approving.",
        channels: BOTH,
        audience: IT_REQUESTS,
      },
      {
        key: "serviceDeskQueue",
        label: "New IT requests",
        description:
          "Each new request that reaches the IT queue. Sent to the IT team — or to administrators while there is no IT team.",
        channels: BOTH,
        audience: ["servicedesk.work"],
      },
    ],
  },
]

export function isChannelOn(
  prefs: NotificationPreferences | undefined,
  category: NotificationCategory,
  channel: NotificationChannel
): boolean {
  return prefs?.[category]?.[channel] !== false
}

// Mirrors the server's merge so the optimistic cache matches what comes back.
export function applyPreferencePatch(
  prefs: NotificationPreferences | undefined,
  patch: NotificationPreferences
): NotificationPreferences {
  const next: NotificationPreferences = { ...(prefs ?? {}) }
  for (const [category, channels] of Object.entries(patch) as [NotificationCategory, Partial<Record<NotificationChannel, boolean>>][]) {
    const merged = { ...(next[category] ?? {}), ...channels }
    const off: Partial<Record<NotificationChannel, boolean>> = {}
    if (merged.inApp === false) off.inApp = false
    if (merged.email === false) off.email = false
    if (Object.keys(off).length) next[category] = off
    else delete next[category]
  }
  return next
}
