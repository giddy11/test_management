import { useCallback, useEffect, useRef, useState } from "react"
import { connectSocket } from "@/lib/socket"
import { useAuth } from "@/contexts/AuthContext"

interface TypingUser {
  userId: string
  userName: string
}

const STOP_DELAY_MS = 3000 // auto-stop after this much silence
const EXPIRE_MS = 5000 // drop a typer if no refresh arrives (missed stop/disconnect)

// roomId is an opaque, caller-namespaced key (e.g. `feature-request:${id}`,
// `bug:${id}`) — this hook doesn't need to know what kind of thread it's
// scoping, only that every caller for the same thread agrees on the key.
export function useTypingIndicator(roomId: string) {
  const { user } = useAuth()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expireTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!roomId) return
    const socket = connectSocket()
    const expireTimers = expireTimersRef.current
    socket.emit("room:join", { roomId })

    const clearExpire = (userId: string) => {
      const t = expireTimers.get(userId)
      if (t) clearTimeout(t)
      expireTimers.delete(userId)
    }

    const onStart = (payload: { roomId: string; userId: string; userName: string }) => {
      if (payload.roomId !== roomId || payload.userId === user?.id) return
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === payload.userId) ? prev : [...prev, { userId: payload.userId, userName: payload.userName }]
      )
      clearExpire(payload.userId)
      expireTimers.set(
        payload.userId,
        setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId)), EXPIRE_MS)
      )
    }
    const onStop = (payload: { roomId: string; userId: string }) => {
      if (payload.roomId !== roomId) return
      clearExpire(payload.userId)
      setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId))
    }

    socket.on("typing:start", onStart)
    socket.on("typing:stop", onStop)

    return () => {
      socket.emit("room:leave", { roomId })
      socket.off("typing:start", onStart)
      socket.off("typing:stop", onStop)
      expireTimers.forEach((t) => clearTimeout(t))
      expireTimers.clear()
      setTypingUsers([])
    }
  }, [roomId, user?.id])

  const notifyTyping = useCallback(() => {
    if (!roomId || !user) return
    const socket = connectSocket()
    socket.emit("typing:start", { roomId, userName: user.name })

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    stopTimerRef.current = setTimeout(() => {
      socket.emit("typing:stop", { roomId })
    }, STOP_DELAY_MS)
  }, [roomId, user])

  return { typingUsers, notifyTyping }
}
