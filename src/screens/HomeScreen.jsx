import { useEffect, useState } from 'react'
import { Camera, UserPlus, LayoutDashboard, Users, Clock as ClockIcon } from 'lucide-react'
import LangToggle from '../components/LangToggle.jsx'
import { api } from '../utils/api.js'

export default function HomeScreen({ t, lang, setLang, onPunch, onRegister, onDashboard }) {
  const [stats, setStats] = useState({ workers: 0, punches: 0 })
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    let cancelled = false
    const load = () => api.stats().then(s => { if (!cancelled) setStats(s) }).catch(() => {})
    load()
    const statId = setInterval(load, 10000)
    const tickId = setInterval(() => setNow(new Date()), 1000)
    return () => { cancelled = true; clearInterval(statId); clearInterval(tickId) }
  }, [])

  const locale = lang === 'es' ? 'es-ES' : 'en-US'
  const timeStr = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 flex flex-col px-16 sm:px-20 py-5 gap-5 fade-in">
      <div className="flex justify-end">
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      {/* WELCOME + clock card */}
      <div className="card px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{t.welcome}</div>
        <div className="text-5xl text-slate-900 tabular-nums mt-1" style={{ fontWeight: 600 }}>{timeStr}</div>
        <div className="text-sm text-slate-500 mt-1 capitalize">{dateStr}</div>
      </div>

      {/* Single Punch In/Out button — server auto-toggles based on last state */}
      <div className="flex flex-col gap-3.5">
        <button onClick={() => onPunch()} className="btn-big btn-primary flex items-center justify-center gap-3">
          <Camera size={26} strokeWidth={2} />
          <span>{t.punchIn}</span>
        </button>
        <button onClick={onRegister} className="btn-big btn-success flex items-center justify-center gap-3">
          <UserPlus size={26} strokeWidth={2} />
          <span>{t.register}</span>
        </button>
        <button onClick={onDashboard} className="btn-big btn-ghost flex items-center justify-center gap-3">
          <LayoutDashboard size={24} strokeWidth={2} />
          <span>{t.dashboard}</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Two compact stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Users}     label={t.totalWorkers} value={stats.workers || 0} />
        <StatTile icon={ClockIcon} label={t.punches}      value={stats.punches || 0} />
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <div className="text-2xl text-slate-900 tabular-nums" style={{ fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  )
}
