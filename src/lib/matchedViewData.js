import { useCallback, useEffect, useState } from 'react'
import snapshot from '@/data/matched-view-responses.json'

// Reads the P8 matched-view responses: live from the dev endpoint while running
// locally, otherwise the snapshot bundled at build time.
//
// Mirrors useSurveyResponses() for P3. Kept as a separate hook rather than
// generalised into one: the two instruments have different record shapes and
// different endpoints, and a shared reader would need a mode flag whose only
// job would be to keep them apart — which is what two functions already do.
export function useMatchedViewResponses() {
  const [records, setRecords] = useState(snapshot)
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('snapshot')
  const [readAt, setReadAt] = useState(null)

  const refresh = useCallback(async () => {
    if (!import.meta.env.DEV) return
    setLoading(true)
    try {
      const res = await fetch('/__matched-view-responses', { cache: 'no-store' })
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
