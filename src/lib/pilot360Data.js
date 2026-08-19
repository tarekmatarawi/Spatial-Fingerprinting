import { useCallback, useEffect, useState } from 'react'
import snapshot from '@/data/pilot-360-responses.json'

// Reads the pilot's responses. Mirrors useSurveyResponses: live from the dev
// endpoint while running locally, otherwise the file bundled at build time.
export function usePilot360Responses() {
  const [records, setRecords] = useState(snapshot)
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('snapshot')
  const [readAt, setReadAt] = useState(null)

  const refresh = useCallback(async () => {
    if (!import.meta.env.DEV) return
    setLoading(true)
    try {
      const res = await fetch('/__pilot-360-responses', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (Array.isArray(data)) {
        setRecords(data)
        setSource('live')
        setReadAt(new Date())
      }
    } catch {
      // Keep the bundled snapshot; the page labels which one it is showing.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { records, refresh, loading, source, readAt }
}
