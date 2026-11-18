import { useCallback, useSyncExternalStore } from 'react'

/** Match viewport and accessibility preferences without intercepting input events. */
export function useMedia(query: string) {
  const subscribe = useCallback((update: () => void) => {
    const match = window.matchMedia(query)
    match.addEventListener('change', update)
    return () => match.removeEventListener('change', update)
  }, [query])
  const get = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, get, () => false)
}
