import { useCallback, useEffect, useState } from 'react'
import bundled from '@/data/survey-responses.json'

// Reading the collected survey sessions back into the researcher's pages.
//
// The file src/data/survey-responses.json is the single store either way: the
// dev-only /__save-survey endpoint appends to it while testing locally, and
// `npm run sync:survey` overwrites it with everything pulled from the Google
// Sheet after real participants have been out in the world. But an `import` of
// that file is frozen at build time, so a page holding only the import goes
// stale the moment a participant submits.
//
// So: start from the bundled copy (always something to show, works on the
// deployed static site) and try to replace it with what is on disk right now.
// In `npm run dev` that succeeds and the page tracks the file live. On the
// built site the endpoint doesn't exist, the fetch fails, and the bundled
// snapshot stands — reported honestly as 'snapshot' rather than passed off as
// current.

const ENDPOINT = '/__survey-responses'

export function useSurveyResponses() {
  const [records, setRecords] = useState(bundled)
  // 'snapshot' — the build-time copy | 'live' — re-read from disk just now
  const [source, setSource] = useState('snapshot')
  const [loading, setLoading] = useState(false)
  const [readAt, setReadAt] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('Expected an array of sessions')
      setRecords(data)
      setSource('live')
      setReadAt(new Date())
    } catch {
      // No endpoint (static build) or unreadable file — keep whatever is
      // already on screen rather than blanking the page.
      setSource('snapshot')
    } finally {
      setLoading(false)
    }
  }, [])

  // Refresh once on mount so simply opening the page picks up anything
  // collected since the dev server started.
  useEffect(() => {
    refresh()
  }, [refresh])

  return { records, refresh, loading, source, readAt }
}
