// components/auth/GoogleButton.tsx — Google Identity button -> backend /auth/google.
import { GoogleLogin } from "@react-oauth/google"
import { toast } from "sonner"
import { useTheme } from "@/contexts/ThemeContext"
import { useGoogleLogin } from "@/hooks/useAuth"
import { ApiError } from "@/transport/http"

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export function GoogleButton() {
  const google = useGoogleLogin()
  const { resolvedTheme } = useTheme()

  // Hidden entirely when Google Sign In isn't configured.
  if (!CLIENT_ID) return null

  return (
    <div className="grid gap-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <div className="flex justify-center">
        <GoogleLogin
          theme={resolvedTheme === "dark" ? "filled_black" : "outline"}
          shape="rectangular"
          text="continue_with"
          width="320"
          onSuccess={(cred) => {
            if (!cred.credential) {
              toast.error("Google sign-in failed")
              return
            }
            google.mutate(cred.credential, {
              onError: (e) =>
                toast.error(e instanceof ApiError ? e.message : "Google sign-in failed"),
            })
          }}
          onError={() => toast.error("Google sign-in failed")}
        />
      </div>
    </div>
  )
}
