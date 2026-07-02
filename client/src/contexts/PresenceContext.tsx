// contexts/PresenceContext.tsx — app-wide online/offline presence, via Socket.IO.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { connectSocket, disconnectSocket } from "@/lib/socket"
import { useAuth } from "@/contexts/AuthContext"

interface PresenceContextValue {
  isOnline: (userId: string) => boolean
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return

    const socket = connectSocket()

    const onSnapshot = ({ userIds }: { userIds: string[] }) => setOnlineIds(new Set(userIds))
    const onOnline = ({ userId }: { userId: string }) =>
      setOnlineIds((prev) => new Set(prev).add(userId))
    const onOffline = ({ userId }: { userId: string }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })

    socket.on("presence:snapshot", onSnapshot)
    socket.on("presence:online", onOnline)
    socket.on("presence:offline", onOffline)

    return () => {
      socket.off("presence:snapshot", onSnapshot)
      socket.off("presence:online", onOnline)
      socket.off("presence:offline", onOffline)
      disconnectSocket()
    }
    // Deliberately keyed on user?.id, not the user object — react-query returns a new
    // object on every refetch, and reconnecting the socket each time would drop the
    // typing-room/presence state for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const value: PresenceContextValue = {
    isOnline: (userId: string) => onlineIds.has(userId),
  }

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePresence(): PresenceContextValue {
  const ctx = useContext(PresenceContext)
  if (!ctx) throw new Error("usePresence must be used within a PresenceProvider")
  return ctx
}
