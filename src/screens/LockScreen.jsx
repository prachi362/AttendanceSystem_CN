import { useState } from 'react'
import { Delete } from 'lucide-react'
import Clock from '../components/Clock.jsx'
import LangToggle from '../components/LangToggle.jsx'

const ACCESS_CODE = '12345'
const CODE_LEN = ACCESS_CODE.length

export default function LockScreen({ t, lang, setLang, onUnlock }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)

  function press(d) {
    setErr(false)
    if (code.length >= CODE_LEN) return
    const next = code + d
    setCode(next)
    if (next.length === CODE_LEN) {
      setTimeout(() => {
        if (next === ACCESS_CODE) onUnlock()
        else { setErr(true); setCode('') }
      }, 150)
    }
  }
  function back() { setErr(false); setCode(code.slice(0, -1)) }

  const digits = ['1','2','3','4','5','6','7','8','9']

  return (
    <div
      className="flex-1 flex flex-col p-7 text-white relative overflow-hidden fade-in"
      style={{
        background:
          'radial-gradient(900px 700px at 20% 0%, #1ba6d6 0%, transparent 60%),' +
          'radial-gradient(800px 600px at 100% 100%, #0a78a0 0%, transparent 55%),' +
          'linear-gradient(160deg, #0a78a0 0%, #07314a 100%)'
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative flex justify-between items-start">
        <Clock lang={lang} className="text-white/95" />
        <LangToggle lang={lang} setLang={setLang} variant="dark" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center gap-7">
        <img src="/logo.png" alt="Conquer Nation" className="w-44 max-w-[55%] object-contain drop-shadow-2xl" />

        <div className="text-center">
          <div className="text-lg font-medium text-white/80">{t.enterCode}</div>
        </div>

        <div className="flex gap-3">
          {Array.from({ length: CODE_LEN }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${code.length > i ? 'bg-white scale-110' : 'bg-white/30'}`}
            />
          ))}
        </div>

        <div className={`h-6 text-red-200 text-base font-semibold transition-opacity ${err ? 'opacity-100' : 'opacity-0'}`}>
          {t.wrongCode}
        </div>

        <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
          {digits.map(d => (
            <button
              key={d}
              onClick={() => press(d)}
              className="bg-white/10 hover:bg-white/20 active:scale-95 transition rounded-2xl py-5 text-3xl font-semibold backdrop-blur border border-white/10"
            >{d}</button>
          ))}
          <div />
          <button
            onClick={() => press('0')}
            className="bg-white/10 hover:bg-white/20 active:scale-95 transition rounded-2xl py-5 text-3xl font-semibold backdrop-blur border border-white/10"
          >0</button>
          <button
            onClick={back}
            className="bg-white/10 hover:bg-white/20 active:scale-95 transition rounded-2xl py-5 flex items-center justify-center backdrop-blur border border-white/10"
          ><Delete size={26} /></button>
        </div>
      </div>
    </div>
  )
}
