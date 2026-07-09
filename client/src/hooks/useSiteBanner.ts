// hooks/useSiteBanner.ts — the site-wide broadcast banner, pushed live via Socket.IO.
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SiteBannerEndpoints } from "@/endpoints/siteBanner.endpoints"
import { connectSocket } from "@/lib/socket"
import { useAuth } from "@/contexts/AuthContext"
import type { SiteBanner } from "@/types/siteBanner.types"

export const SITE_BANNER_KEY = ["site-banner", "current"]

const EMPTY_BANNER: SiteBanner = { message: null, isActive: false, expiresAt: null }

export function useSiteBanner() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [expired, setExpired] = useState(false)

  const { data: banner = EMPTY_BANNER } = useQuery({
    queryKey: SITE_BANNER_KEY,
    queryFn: async () => {
      const res = await SiteBannerEndpoints.fetchCurrent()
      return res.success && res.data ? res.data : EMPTY_BANNER
    },
    enabled: !!user,
  })

  // connectSocket() is idempotent — reuses the same connection PresenceProvider
  // opens, rather than racing it to create a second one.
  useEffect(() => {
    if (!user) return
    const socket = connectSocket()

    const onUpdate = (payload: SiteBanner) => {
      qc.setQueryData(SITE_BANNER_KEY, payload)
      setExpired(false)
    }

    socket.on("banner:update", onUpdate)
    return () => {
      socket.off("banner:update", onUpdate)
    }
  }, [user, qc])

  // No cron on the server — the client hides the banner locally the moment its
  // chosen duration lapses, without waiting for another push.
  useEffect(() => {
    setExpired(false)
    if (!banner.isActive || !banner.expiresAt) return

    const msRemaining = new Date(banner.expiresAt).getTime() - Date.now()
    if (msRemaining <= 0) {
      setExpired(true)
      return
    }
    const timer = setTimeout(() => setExpired(true), msRemaining)
    return () => clearTimeout(timer)
  }, [banner.isActive, banner.expiresAt])

  const isVisible = banner.isActive && !!banner.message && !expired

  return { banner, isVisible }
}
