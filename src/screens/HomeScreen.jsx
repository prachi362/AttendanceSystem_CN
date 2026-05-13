import { useEffect, useState } from 'react'
import { Camera, UserPlus, Users, Clock as ClockIcon, LayoutDashboard } from 'lucide-react'
import LangToggle from '../components/LangToggle.jsx'
import Clock from '../components/Clock.jsx'
import { api } from '../utils/api.js'

export default function HomeScreen({ t, lang, setLang, onPunch, onRegister, onDashboard }) {
  const [stats, setStats] = useState({ workers: 0, punches: 0 })

  useEffect(() => {
    api.stats().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="flex-1 flex flex-col p-7 gap-6 fade-in">
      <div className="flex justify-end items-center">
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      <div className="card p-5">
        <div className="text-slate-500 text-sm font-medium uppercase tracking-wider">{t.welcome}</div>
        <div className="mt-1 text-slate-900">
          <Clock lang={lang} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 flex-1 content-start">
        <button onClick={onPunch} className="btn-big btn-primary flex items-center justify-center gap-4">
          <div className="bg-white/20 rounded-2xl p-3">
            <Camera size={36} strokeWidth={2.4} />
          </div>
          <span>{t.punchIn}</span>
        </button>

        <button onClick={onRegister} className="btn-big btn-success flex items-center justify-center gap-4">
          <div className="bg-white/20 rounded-2xl p-3">
            <UserPlus size={36} strokeWidth={2.4} />
          </div>
          <span>{t.register}</span>
        </button>

        <button onClick={onDashboard} className="btn-big btn-ghost flex items-center justify-center gap-4">
          <div className="bg-brand-50 text-brand-600 rounded-2xl p-3">
            <LayoutDashboard size={32} strokeWidth={2.4} />
          </div>
          <span className="text-slate-800">{t.dashboard}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Users size={20} />} label={t.workers} value={stats.workers} />
        <Stat icon={<ClockIcon size={20} />} label={t.punches} value={stats.punches} />
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="bg-brand-50 text-brand-600 rounded-xl p-2">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      </div>
    </div>
  )
}
