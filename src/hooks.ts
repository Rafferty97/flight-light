import { useCallback, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : initial
    } catch {
      return initial
    }
  })

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // meh
        }
        return resolved
      })
    },
    [key],
  )

  return [value, set] as const
}
