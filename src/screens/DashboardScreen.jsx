import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCw, Search, Users as UsersIcon, ClipboardList } from 'lucide-react'
import { api } from '../utils/api.js'

export default function DashboardScreen({ t, onBack }) {
  const [punches, setPunches] = useState([])
  const [workers, setWorkers] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [p, w] = await Promise.all([api.listPunches(500), api.listWorkers()])
      setPunches(p); setWorkers(w)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return punches.filter(p => !term || p.name?.toLowerCase().includes(term))
  }, [punches, q])

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 fade-in min-h-0">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-3 rounded-2xl bg-white/80 hover:bg-white border border-slate-200 transition active:scale-95">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{t.dashboard}</h2>
        <button onClick={load} className="ml-auto p-3 rounded-2xl bg-white/80 hover:bg-white border border-slate-200 transition active:scale-95">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<UsersIcon size={18} />} label={t.workers} value={workers.length} />
        <Stat icon={<ClipboardList size={18} />} label={t.punches} value={punches.length} />
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
        <div className="grid grid-cols-[56px_1fr_110px_90px] gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/60">
          <div>{t.photo}</div>
          <div>{t.name}</div>
          <div>{t.time}</div>
          <div className="text-right">{t.size}</div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 font-medium">{loading ? '…' : t.noData}</div>
          ) : rows.map(p => (
            <div key={p.id} className="grid grid-cols-[56px_1fr_110px_90px] gap-3 px-4 py-2.5 items-center hover:bg-slate-50">
              {p.photo ? (
                <img src={'/' + p.photo} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-200" />
              ) : <div className="w-12 h-12 rounded-xl bg-slate-200" />}
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                <div className="text-xs text-slate-500 truncate">{new Date(p.ts).toLocaleDateString()}</div>
              </div>
              <div className="text-sm font-semibold text-slate-700 tabular-nums">
                {new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-right text-xs text-slate-500 tabular-nums">
                {p.sizeBytes ? `${Math.round(p.sizeBytes / 1024)} KB` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="bg-brand-50 text-brand-600 rounded-xl p-2">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-xl font-bold text-slate-900 tabular-nums">{value}</div>
      </div>
    </div>
  )
}
