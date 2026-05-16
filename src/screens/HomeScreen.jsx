import { useEffect, useState } from 'react'
import { Camera, UserPlus, LayoutDashboard } from 'lucide-react'
import LangToggle from '../components/LangToggle.jsx'

const DASHBOARD_PIN = '2651'

export default function HomeScreen({ t, lang, setLang, onPunch, onRegister, onDashboard }) {
  const [now, setNow] = useState(new Date())
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)

  function submitPin() {
    if (pin === DASHBOARD_PIN) {
      setPinOpen(false); setPin(''); setPinError(false)
      onDashboard()
    } else {
      setPinError(true)
    }
  }

  useEffect(() => {
    const tickId = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tickId)
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
        <button onClick={() => { setPin(''); setPinError(false); setPinOpen(true) }} className="btn-big btn-ghost flex items-center justify-center gap-3">
          <LayoutDashboard size={24} strokeWidth={2} />
          <span>{t.dashboard}</span>
        </button>
      </div>

      <div className="flex-1" />

      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
             onClick={() => { setPinOpen(false); setPin(''); setPinError(false) }}>
          <div className="card w-full max-w-sm p-6 flex flex-col gap-4"
               onClick={(e) => e.stopPropagation()}>
            <div className="text-lg text-slate-900" style={{ fontWeight: 600 }}>Enter dashboard code</div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPin() }}
              placeholder="••••"
              className={`w-full text-center text-2xl tracking-[0.5em] tabular-nums px-4 py-3 rounded-2xl border ${pinError ? 'border-rose-400' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-brand-300`}
            />
            {pinError && <div className="text-rose-500 text-sm text-center">Incorrect code</div>}
            <div className="flex gap-3">
              <button onClick={() => { setPinOpen(false); setPin(''); setPinError(false) }}
                      className="btn-big btn-ghost flex-1">Cancel</button>
              <button onClick={submitPin} className="btn-big btn-primary flex-1">Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
