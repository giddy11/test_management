import { useCallback, useEffect, useState } from "react"

const PREFIX = "tm_"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage blocked/full — behaves like plain useState.
  }
}

// useState that survives unmounting by mirroring to sessionStorage (per browser
// tab, gone when it closes). Used for list filters so opening an item and coming
// back — via the back link, the browser button, or a post-delete redirect —
// leaves the list as it was. Values must be JSON-serialisable (use null, not
// undefined, for "unset").
export function usePersistedState<T>(key: string, initial: T) {
  const [entry, setEntry] = useState(() => ({ key, value: read(key, initial) }))

  // Key changed (e.g. another project reusing this component) — load that key's
  // value rather than carrying the previous one over.
  let current = entry
  if (entry.key !== key) {
    current = { key, value: read(key, initial) }
    setEntry(current)
  }

  useEffect(() => write(entry.key, entry.value), [entry])

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setEntry((e) => ({
      key: e.key,
      value: typeof next === "function" ? (next as (prev: T) => T)(e.value) : next,
    }))
  }, [])

  return [current.value, setValue] as const
}
