// lib/socket.ts — single Socket.IO instance, for typing indicators + presence only.
// Comments themselves stay on Firestore (see lib/firestore.ts) — this is a second,
// purpose-built realtime channel for ephemeral, connection-oriented signals.
import { io, type Socket } from "socket.io-client"
import { tokenStorage } from "@/lib/storage"

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

let socket: Socket | null = null

export function connectSocket(): Socket {
  // Reuse the instance whether or not it has finished connecting: socket.io
  // reconnects on its own, and guarding on `.connected` meant every caller
  // during a connect or a reconnect opened ANOTHER client, leaving the old one
  // retrying forever. Four call sites share this connection, so a server that
  // is slow, down, or briefly unreachable used to leak a socket per render.
  if (socket) return socket
  socket = io(SOCKET_URL, {
    auth: { token: tokenStorage.getAccess() },
  })
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}
