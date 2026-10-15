'use client'

import { useEffect, useState } from 'react'

class ApplicationReadError extends Error {}

/** A private, abortable read. A new query never renders the previous query's data. */
export function useApplicationRead<T>(url: string | null) {
  const [attempt, setAttempt] = useState(0)
  const key = `${url ?? ''}:${attempt}`
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null })
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let active = true
    fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new ApplicationReadError('Your admin session is unavailable. Sign in again to continue.')
          if (response.status === 404) throw new ApplicationReadError('This job is no longer available.')
          throw new ApplicationReadError('Unable to load applications. Please try again.')
        }
        return response.json() as Promise<T>
      })
      .then(data => { if (active) setResult({ key, data, error: null }) })
      .catch(error => {
        if (active && !controller.signal.aborted) setResult({ key, data: null, error: error instanceof ApplicationReadError ? error.message : 'Unable to load applications. Please try again.' })
      })
    return () => { active = false; controller.abort() }
  }, [url, key])
  return {
    data: result.key === key && url ? result.data : null,
    error: result.key === key && url ? result.error : null,
    loading: !!url && result.key !== key,
    retry: () => setAttempt(value => value + 1),
  }
}
