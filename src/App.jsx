import { useEffect, useState } from 'react'
import { strings } from './i18n.js'
import { ensureModels } from './utils/face.js'
import LockScreen from './screens/LockScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import PunchScreen from './screens/PunchScreen.jsx'
import RegisterScreen from './screens/RegisterScreen.jsx'
import DashboardScreen from './screens/DashboardScreen.jsx'

export default function App() {
  const [lang, setLang] = useState('en')
  const [screen, setScreen] = useState('home') // home | punch | register | dashboard
  const t = strings[lang]
useEffect(() => {
    // Warm the face-recognition models so capture is instant later.
    ensureModels().catch(err => console.warn('[face] model preload failed', err))
  }, [])

  
  return (
    <div className="min-h-full flex items-center justify-center p-0 sm:p-6">
      <div className="kiosk-frame rounded-none sm:rounded-[2rem] flex flex-col">
        {/* HEADER */}
        <header className="shrink-0 px-6 pt-6 pb-4 flex items-center justify-center border-b border-slate-200/70 bg-white/60 backdrop-blur-md">
          <img
            src="/logo.png"
            alt="Conquer Nation"
            className="h-20 sm:h-24 object-contain drop-shadow-md"
          />
        </header>

        {/* MAIN */}
        <main className="flex-1 min-h-0 flex flex-col">
          {screen === 'lock' && (
            <LockScreen t={t} lang={lang} setLang={setLang} onUnlock={() => setScreen('home')} />
          )}
          {screen === 'home' && (
            <HomeScreen
              t={t} lang={lang} setLang={setLang}
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
            />
          )}
        </main>

        {/* FOOTER */}
        <footer className="shrink-0 px-6 py-3 flex items-center justify-between border-t border-slate-200/70 bg-white/60 backdrop-blur-md text-xs font-semibold text-slate-500">
          <span className="tracking-wider uppercase">Conquer Nation</span>
          <span className="tabular-nums">© {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  )
}
