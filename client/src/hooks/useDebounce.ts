import { useEffect, useState } from "react"

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

// A search box's debounced term — typing waits out the delay, but an emptied box
// applies at once. Otherwise "Clear filters" sends one request with the other
// filters cleared but the old term still on, then the right one a beat later.
export function useDebouncedSearch(input: string, delayMs = 300): string {
  const debounced = useDebounce(input, delayMs)
  return input === "" ? "" : debounced
}
