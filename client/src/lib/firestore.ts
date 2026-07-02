// lib/firestore.ts — single Firestore instance. Read-only from the client: comments
// are written by the server (Admin SDK); Firestore rules block all client writes.
// Anonymous sign-in only satisfies "must be authenticated to read" — it carries no
// identity of its own and isn't linked to this app's own auth/session.
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, signInAnonymously } from "firebase/auth"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

let signInPromise: Promise<void> | null = null

// Idempotent — safe to call from every component that needs a live listener.
export function ensureFirebaseAuth(): Promise<void> {
  if (!signInPromise) {
    signInPromise = signInAnonymously(getAuth(app)).then(() => undefined)
  }
  return signInPromise
}
