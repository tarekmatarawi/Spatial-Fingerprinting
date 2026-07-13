import { useState } from 'react'
import { AdminPage } from '@/pages/AdminPage'
import { SiteViewer } from '@/components/SiteViewer'

// Phase codes are real: the build spec proceeds phase by phase, so each tab
// carries its sheet-style phase number like a drawing set index.
const TABS = [
  { id: 'admin', phase: 'P1', label: 'Site data' },
  { id: 'viewer', phase: 'P2', label: '3D viewer' },
]

export default function App() {
  const [tab, setTab] = useState('viewer')

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <nav className="flex shrink-0 items-stretch gap-6 border-b border-line bg-bg px-5">
        <div className="flex items-center gap-2.5 py-3">
          <span className="font-semibold tracking-tight text-ink">Spatial Fingerprinting</span>
          <span className="font-mono text-[11px] text-ink-faint">isovist research platform</span>
        </div>

        <div className="flex items-stretch gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
                tab === t.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span
                className={`font-mono text-[11px] ${
                  tab === t.id ? 'text-primary' : 'text-ink-faint'
                }`}
              >
                {t.phase}
              </span>
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="relative min-h-0 flex-1">
        {tab === 'admin' && <AdminPage />}
        {tab === 'viewer' && <SiteViewer />}
      </div>
    </div>
  )
}
