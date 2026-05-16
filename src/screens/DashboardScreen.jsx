import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Search, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { api } from '../utils/api.js'

export default function DashboardScreen({ t, onBack }) {
  const [stats, setStats] = useState({ workers: 0, todayPunches: 0, clockedIn: 0 })
  const [punches, setPunches] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([api.stats(), api.listPunches(500)])
      setStats(s); setPunches(p)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Show ALL punches (today + previous days), grouped by date so the dashboard
  // doubles as a history view.
  const filtered = punches.filter(p => !q.trim() || p.name?.toLowerCase().includes(q.toLowerCase()))
  const groups = groupByDay(filtered)

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 fade-in min-h-0">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-xl text-slate-900" style={{ fontWeight: 600 }}>{t.dashboard}</h2>
        <button onClick={load} className="ml-auto p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <BigStat label={t.todayPunches} value={stats.todayPunches} />
        <BigStat label={t.totalWorkers} value={stats.workers} />
        <BigStat label={t.clockedIn} value={stats.clockedIn} accent />
      </div>

      <div className="card flex items-center gap-2 px-3 py-2">
        <Search size={18} className="text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t.search}
          className="flex-1 bg-transparent outline-none text-base py-2"
        />
      </div>

      <div className="card overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="grid grid-cols-[56px_1fr_60px_70px_90px] gap-3 px-4 py-3 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100" style={{ fontWeight: 600 }}>
          <div>{t.photo}</div>
          <div>{t.name}</div>
          <div>{t.direction}</div>
          <div className="text-right">Hrs</div>
          <div className="text-right">{t.time}</div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400">{loading ? '…' : t.noData}</div>
          ) : groups.map(g => (
            <div key={g.key}>
              <div className="sticky top-0 z-10 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 bg-[rgba(15,31,56,0.92)] border-b border-slate-100" style={{ fontWeight: 600 }}>
                {g.label}
              </div>
              <div className="divide-y divide-slate-100">
                {g.items.map(p => {
                  // Sheet-sourced rows carry an absolute Drive URL in `photoUrl`.
                  // Local-db rows carry a relative path in `photo` (legacy).
                  const src = p.photoUrl || (p.photo ? '/' + p.photo : null)
                  return (
                  <div key={p.id} className="grid grid-cols-[56px_1fr_60px_70px_90px] gap-3 px-4 py-2.5 items-center hover:bg-slate-50">
                    {src ? (
                      <img src={src} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-xl object-cover bg-slate-100" />
                    ) : <div className="w-12 h-12 rounded-xl bg-slate-100" />}
                    <div className="min-w-0">
                      <div className="text-slate-900 truncate" style={{ fontWeight: 600 }}>{p.name}</div>
                    </div>
                    <DirBadge dir={p.direction || 'in'} t={t} />
                    <div className="text-right text-sm text-slate-700 tabular-nums">
                      {typeof p.hoursWorked === 'number' ? p.hoursWorked.toFixed(2) : '—'}
                    </div>
                    <div className="text-right text-sm text-slate-700 tabular-nums">
                      {new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Group punches into per-day buckets, newest day first, with a human-readable label.
function groupByDay(items) {
  const buckets = new Map()
  for (const p of items) {
    const d = new Date(p.ts)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(p)
  }
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today.getTime() - 86400000)
  function label(key) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    if (date.getTime() === today.getTime()) return 'Today'
    if (date.getTime() === yesterday.getTime()) return 'Yesterday'
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, label: label(key), items }))
}

function BigStat({ label, value, accent }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl tabular-nums ${accent ? 'text-emerald-600' : 'text-slate-900'}`} style={{ fontWeight: 600 }}>{value ?? 0}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
    </div>
  )
}

function DirBadge({ dir, t }) {
  const isIn = dir === 'in'
  const Icon = isIn ? ArrowDownRight : ArrowUpRight
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] tracking-wider ${isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`} style={{ fontWeight: 600 }}>
      <Icon size={12} />
      {isIn ? t.inLabel : t.outLabel}
    </div>
  )
}
