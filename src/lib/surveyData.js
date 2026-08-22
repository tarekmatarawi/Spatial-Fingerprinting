import { useCallback, useEffect, useState } from 'react'
import snapshot from '@/data/survey-responses-360.json'

// Reads the survey's responses: live from the dev endpoint while running
// locally, otherwise the snapshot bundled at build time.
//
// The archived static-photo dataset (src/data/survey-responses.json) is
// deliberately NOT read here. It stays on disk as a record of the earlier
// instrument and is not surfaced anywhere in the app.
export function useSurveyResponses() {
  const [records, setRecords] = useState(snapshot)
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('snapshot')
  const [readAt, setReadAt] = useState(null)

  const refresh = useCallback(async () => {
    if (!import.meta.env.DEV) return
    setLoading(true)
    try {
      const res = await fetch('/__survey-360-responses', { cache: 'no-store' })
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
