import { useState, useCallback } from 'react'
import { CityScene } from '@/components/CityScene'
import { AdminPage } from '@/pages/AdminPage'

const TABS = [
  { id: 'admin', label: 'Site Data (Phase 1)' },
  { id: 'viewer', label: '3D Viewer (Weimar demo)' },
]

export default function App() {
  const [tab, setTab] = useState('admin')
  const [status, setStatus] = useState({ loading: true, error: null, buildingCount: 0 })

  const handleStatusChange = useCallback((next) => {
    setStatus((prev) => ({ ...prev, ...next }))
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-100">
      <nav className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
        <span className="mr-4 font-semibold text-slate-900">Spatial Fingerprinting</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1">
        {tab === 'admin' && <AdminPage />}

        {tab === 'viewer' && (
          <>
            <CityScene onStatusChange={handleStatusChange} />
            <div className="pointer-events-none absolute top-4 left-4 max-w-sm rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
              <h1 className="text-lg font-semibold text-slate-900">Weimar demo</h1>
              <p className="mt-1 text-sm text-slate-600">
                Prototype from the workshop prompt — its viewer and isovist engine will be
                adapted for the 18 thesis sites in Phases 2–3. Drag to orbit, scroll to zoom,
                right-click drag to pan. Click the ground for an isovist.
              </p>
              {status.loading && (
                <p className="mt-3 text-sm text-slate-500">
                  Loading building and street data from OpenStreetMap…
                </p>
              )}
              {status.error && (
                <p className="mt-3 text-sm text-red-600">
                  Couldn&apos;t load city data: {status.error}. Open the browser console (F12)
                  for details.
                </p>
              )}
              {!status.loading && !status.error && (
                <p className="mt-3 text-sm text-slate-500">
                  Loaded {status.buildingCount} buildings.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
