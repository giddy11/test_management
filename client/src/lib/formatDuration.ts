// Human-readable span between two points in time (not relative-to-now like
// timeAgo) — e.g. "2h 15m", "3d 4h", "45s". Used for stage-duration timelines.
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`

  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) {
    const minutes = totalMinutes % 60
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`
  }

  const totalDays = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return hours > 0 ? `${totalDays}d ${hours}h` : `${totalDays}d`
}
