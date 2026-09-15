// components/sla/slaFormat.ts — display helpers shared by the SLA dashboard.
import { formatDuration } from "@/lib/formatDuration"

// "—" for null (nothing measured yet), otherwise a compact span like "3h 20m".
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—"
  return formatDuration(ms)
}

export function fmtPct(rate: number | null | undefined): string {
  if (rate == null) return "—"
  return `${Math.round(rate * 10) / 10}%`
}

// Hours → "30m" / "4h" / "2d" — for SLA targets in the rules editor.
export function fmtHours(hours: number): string {
  return formatDuration(hours * 3_600_000)
}

// Colour for a compliance rate: green ≥ 90, amber ≥ 70, else red.
export function rateTone(rate: number | null | undefined): string {
  if (rate == null) return "text-muted-foreground"
  if (rate >= 90) return "text-green-600"
  if (rate >= 70) return "text-yellow-600"
  return "text-red-600"
}

// Local calendar date as YYYY-MM-DD (what <input type="date"> and the API use).
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

// Series colours — one per issue source / outcome, consistent across charts.
export const SLA_COLORS = {
  ticket: "#f59e0b",
  bug: "#f43f5e",
  featureRequest: "#6366f1",
  resolved: "#22c55e",
  breached: "#ef4444",
  met: "#22c55e",
  pending: "#94a3b8",
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  unset: "#94a3b8",
} as const
