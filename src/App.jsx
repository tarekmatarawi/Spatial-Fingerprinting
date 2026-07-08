import { useState } from 'react'
import { AdminPage } from '@/pages/AdminPage'
import { SiteViewer } from '@/components/SiteViewer'

const TABS = [
  { id: 'admin', label: 'Site Data (Phase 1)' },
  { id: 'viewer', label: '3D Viewer (Phase 2)' },
]

export default function App() {
  const [tab, setTab] = useState('viewer')

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-100">
      <nav className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
        <span className="mr-4 font-semibold text-slate-900">Spatial Fingerprinting</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1">
        {tab === 'admin' && <AdminPage />}
        {tab === 'viewer' && <SiteViewer />}
      </div>
    </div>
  )
}
