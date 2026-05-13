import { useEffect, useState } from 'react'
import { strings } from './i18n.js'
import KioskHeader from './components/KioskHeader.jsx'
import { ensureModels } from './utils/face.js'
import HomeScreen from './screens/HomeScreen.jsx'
import PunchScreen from './screens/PunchScreen.jsx'
import RegisterScreen from './screens/RegisterScreen.jsx'
import DashboardScreen from './screens/DashboardScreen.jsx'

const IDLE_MS = 30 * 1000

export default function App() {
  const [lang, setLang] = useState('en')
  const [screen, setScreen] = useState('home') // home | punch | register | dashboard
  const t = strings[lang]

  useEffect(() => {
    ensureModels().catch(err => console.warn('[face] model preload failed', err))
  }, [])

  // Idle timeout: return to home after 30s on any non-home screen.
  useEffect(() => {
    if (screen === 'home') return
    let id
    const reset = () => { clearTimeout(id); id = setTimeout(() => setScreen('home'), IDLE_MS) }
    const events = ['mousedown', 'touchstart', 'keydown']
    events.forEach(e => window.addEventListener(e, reset))
    reset()
    return () => { clearTimeout(id); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [screen])

  return (
    <div className="min-h-full flex items-center justify-center p-0 sm:p-6">
      <div className="kiosk-frame rounded-none sm:rounded-3xl">
        <KioskHeader />

        {/* MAIN */}
        <main className="flex-1 min-h-0 flex flex-col">
          {screen === 'home' && (
            <HomeScreen
              t={t} lang={lang} setLang={setLang}
              key="home"
              onPunch={() => setScreen('punch')}
              onRegister={() => setScreen('register')}
              onDashboard={() => setScreen('dashboard')}
            />
          )}
          {screen === 'dashboard' && (
            <DashboardScreen t={t} onBack={() => setScreen('home')} />
          )}
          {screen === 'punch' && (
            <PunchScreen
              t={t}
              onBack={() => setScreen('home')}
              onDone={() => setScreen('home')}
              onRegister={() => setScreen('register')}
            />
          )}
          {screen === 'register' && (
            <RegisterScreen
              t={t}
              onBack={() => setScreen('home')}
              onDone={() => setScreen('home')}
              onPunched={() => setScreen('home')}
            />
          )}
        </main>

        {/* FOOTER */}
        <footer className="shrink-0 px-6 py-3 flex items-center justify-between border-t border-slate-200 text-[11px] text-slate-500" style={{ fontWeight: 600 }}>
          <span className="tracking-widest uppercase">Conquer Nation</span>
          <span className="tabular-nums">© {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  )
}
