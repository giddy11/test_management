// lib/notificationSound.ts — short two-tone alert chime for new notifications /
// support chat messages. Synthesized via the Web Audio API so no static asset
// has to ship, and it stays crisp at any volume.
let sharedContext: AudioContext | null = null

function getContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedContext) sharedContext = new Ctor()
  return sharedContext
}

function tone(context: AudioContext, freq: number, startTime: number, duration: number) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(context.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

export function playNotificationSound() {
  try {
    const context = getContext()
    if (!context) return
    if (context.state === "suspended") context.resume().catch(() => {})
    const now = context.currentTime
    tone(context, 880, now, 0.15) // A5
    tone(context, 1174.66, now + 0.12, 0.18) // D6
  } catch {
    // Audio isn't available/allowed in this environment — fail silently.
  }
}
