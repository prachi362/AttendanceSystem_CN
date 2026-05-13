import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, UserPlus, Camera, ScanFace, AlertTriangle } from 'lucide-react'
import CameraView from '../components/CameraView.jsx'
import { useCountdown, CountdownBadge } from '../components/Countdown.jsx'
import { captureCompressedJpeg } from '../utils/image.js'
import { descriptorFromDataUrl, bestMatch } from '../utils/face.js'
import { api } from '../utils/api.js'

export default function PunchScreen({ t, onDone, onBack, onRegister }) {
  const camRef = useRef(null)
  const [stage, setStage] = useState('capture') // capture | identifying | done | unknown
  const [photo, setPhoto] = useState(null)
  const [worker, setWorker] = useState(null)
  const [workers, setWorkers] = useState([])
  const [err, setErr] = useState('')
  const [camReady, setCamReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [matchInfo, setMatchInfo] = useState(null)

  useEffect(() => {
    api.listWorkers().then(setWorkers).catch(() => setWorkers([]))
  }, [])

  async function capture() {
    const video = camRef.current?.getVideo()
    const data = captureCompressedJpeg(video, { maxWidth: 480, quality: 0.6 })
    if (!data) return
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
    setPhoto(data)
    setStage('identifying')

    try {
      const descriptor = await descriptorFromDataUrl(data)
      if (!descriptor) {
        setStage('unknown')
        setMatchInfo({ reason: 'noFace' })
        return
      }
      const match = bestMatch(workers, descriptor, 0.55)
      if (!match) {
        setStage('unknown')
        setMatchInfo({ reason: 'noMatch' })
        return
      }
      setWorker(match.worker)
      setMatchInfo({ distance: match.distance })
      await api.createPunch(match.worker.id, match.worker.name, data)
      setStage('done')
      setTimeout(onDone, 2000)
    } catch (e) {
      console.error(e)
      setErr(String(e.message || e))
      setStage('unknown')
    }
  }

  const countdownActive = stage === 'capture' && camReady
  const n = useCountdown({ from: 3, active: countdownActive, onDone: capture })

  if (stage === 'done' && worker) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-7 fade-in">
        <div className="bg-emerald-100 text-emerald-600 rounded-full p-10 shadow-xl">
          <Check size={88} strokeWidth={3} />
        </div>
        <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{t.punchedIn}</p>
        <p className="text-2xl text-slate-600 font-medium">{worker.name}</p>
        <p className="text-sm text-slate-400 tabular-nums">{new Date().toLocaleTimeString()}</p>
        {matchInfo?.distance != null && (
          <p className="text-xs text-slate-400 font-mono">match: {matchInfo.distance.toFixed(3)}</p>
        )}
      </div>
    )
  }

  if (stage === 'identifying') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-7 fade-in">
        <div className="relative bg-brand-50 text-brand-600 rounded-full p-10 shadow-xl">
          <ScanFace size={88} strokeWidth={2.4} />
          <div className="absolute inset-0 rounded-full pulse-ring" />
        </div>
        <p className="text-2xl font-bold text-slate-700 tracking-tight">{t.identifying}</p>
      </div>
    )
  }

  if (stage === 'unknown') {
    return (
      <div className="flex-1 flex flex-col p-7 gap-6 fade-in">
        <Header onBack={onBack} title={t.punchIn} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <div className="bg-amber-100 text-amber-600 rounded-full p-10 shadow-xl">
            <AlertTriangle size={88} strokeWidth={2.2} />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{t.notRecognized}</p>
          <p className="text-base text-slate-500">
            {matchInfo?.reason === 'noFace' ? t.noFace : t.tryAgainOrRegister}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setStage('capture'); setPhoto(null); setErr('') }} className="btn-big btn-ghost text-lg">
            {t.tryAgain}
          </button>
          <button onClick={onRegister} className="btn-big btn-success text-lg flex items-center justify-center gap-2">
            <UserPlus size={24} /> {t.register}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 fade-in">
      <Header onBack={onBack} title={t.punchIn} />

      <div className="text-center">
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{t.pose_front}</p>
        <p className="text-slate-500 text-sm font-medium mt-1">{t.holdStill}</p>
      </div>

      <CameraView
        ref={camRef}
        onError={() => setErr(t.cameraError)}
        onReady={() => setCamReady(true)}
        className="flex-1 min-h-0"
        overlay={countdownActive ? <CountdownBadge n={n} flash={flash} /> : null}
      />

      {err && <p className="text-red-600 text-center font-semibold">{err}</p>}

      <div className="flex items-center justify-center gap-2 text-slate-500 font-semibold">
        <Camera size={20} />
        <span>{t.autoCapture}</span>
      </div>
    </div>
  )
}

function Header({ onBack, title }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-3 rounded-2xl bg-white/80 hover:bg-white border border-slate-200 transition active:scale-95">
        <ArrowLeft size={24} />
      </button>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
    </div>
  )
}
