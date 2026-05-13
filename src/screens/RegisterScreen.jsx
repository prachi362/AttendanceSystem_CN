import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Glasses, ArrowUp, ArrowDown, ArrowLeftCircle, ArrowRightCircle, User, Camera } from 'lucide-react'
import CameraView from '../components/CameraView.jsx'
import { useCountdown, CountdownBadge } from '../components/Countdown.jsx'
import { captureCompressedJpeg } from '../utils/image.js'
import { descriptorFromDataUrl } from '../utils/face.js'
import { api } from '../utils/api.js'

const STEPS = ['front', 'up', 'down', 'left', 'right']
const STEP_ICONS = { front: User, up: ArrowUp, down: ArrowDown, left: ArrowLeftCircle, right: ArrowRightCircle }

export default function RegisterScreen({ t, onDone, onBack }) {
  const camRef = useRef(null)
  const [name, setName] = useState('')
  const [stage, setStage] = useState('name') // name | glasses | capture | saving | done
  const [stepIdx, setStepIdx] = useState(0)
  const [photos, setPhotos] = useState({})
  const [err, setErr] = useState('')
  const [camReady, setCamReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [announcing, setAnnouncing] = useState(true)

  const stepKey = STEPS[stepIdx]
  const poseLabel = t[`pose_${stepKey}`]
  const StepIcon = STEP_ICONS[stepKey] || Camera

  // Show a fullscreen pose prompt for ~1.5s every time we land on a new step.
  useEffect(() => {
    if (stage !== 'capture') return
    setAnnouncing(true)
    const id = setTimeout(() => setAnnouncing(false), 1500)
    return () => clearTimeout(id)
  }, [stage, stepIdx])

  async function capture() {
    const video = camRef.current?.getVideo()
    const data = captureCompressedJpeg(video, { maxWidth: 480, quality: 0.7 })
    if (!data) return
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
    const next = { ...photos, [stepKey]: data }
    setPhotos(next)
    if (stepIdx + 1 < STEPS.length) {
      setTimeout(() => setStepIdx(stepIdx + 1), 350)
    } else {
      setStage('saving')
      try {
        // Compute face descriptor from the front-facing photo for matching later.
        let descriptor = null
        try { descriptor = await descriptorFromDataUrl(next.front) } catch (e) { console.warn('[face] descriptor failed', e) }
        await api.createWorker(name.trim(), next, descriptor)
        setStage('done')
        setTimeout(onDone, 1600)
      } catch (e) {
        setErr(String(e.message || e))
        setStage('capture')
      }
    }
  }

  // Auto-capture: countdown only runs after the pose announcement is dismissed.
  const countdownActive = stage === 'capture' && camReady && !announcing
  const n = useCountdown({
    from: 3,
    active: countdownActive,
    resetKey: stepIdx,
    onDone: capture
  })

  if (stage === 'name') {
    return (
      <div className="flex-1 flex flex-col p-7 gap-6 fade-in">
        <Header onBack={onBack} title={t.register} />
        <div className="flex-1 flex flex-col justify-center gap-5">
          <label className="text-xl font-bold text-slate-700">{t.yourName}</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.typeName}
            className="w-full text-3xl font-semibold rounded-2xl border-2 border-slate-200 bg-white/80 px-5 py-5 focus:border-brand-500 focus:bg-white outline-none transition shadow-sm"
          />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => setStage('glasses')}
          className="btn-big btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >{t.next}</button>
      </div>
    )
  }

  if (stage === 'glasses') {
    return (
      <div className="flex-1 flex flex-col p-7 gap-6 fade-in">
        <Header onBack={() => setStage('name')} title={t.register} />
        <div className="flex-1 flex flex-col items-center justify-center gap-7 text-center">
          <div className="bg-amber-100 text-amber-600 rounded-full p-10 shadow-xl">
            <Glasses size={88} strokeWidth={2.2} />
          </div>
          <p className="text-2xl font-bold text-slate-900 px-4 leading-snug max-w-md">{t.glasses}</p>
        </div>
        <button onClick={() => setStage('capture')} className="btn-big btn-primary">{t.start}</button>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-7 fade-in">
        <div className="bg-emerald-100 text-emerald-600 rounded-full p-10 shadow-xl">
          <Check size={88} strokeWidth={3} />
        </div>
        <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{t.registered}</p>
        <p className="text-xl text-slate-500 font-medium">{name}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 fade-in relative">
      <Header onBack={onBack} title={`${t.step} ${stepIdx + 1} / ${STEPS.length}`} />

      {announcing && (
        <PoseAnnouncement icon={StepIcon} label={poseLabel} />
      )}

      <div className="flex gap-1.5 px-1">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              i < stepIdx ? 'bg-emerald-500' : i === stepIdx ? 'bg-brand-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 text-center">
        <div className="bg-brand-50 text-brand-600 rounded-2xl p-2.5">
          <StepIcon size={28} strokeWidth={2.4} />
        </div>
        <p className="text-xl font-bold text-slate-900 tracking-tight">{poseLabel}</p>
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
        <span>{stage === 'saving' ? t.saving : t.autoCapture}</span>
      </div>
    </div>
  )
}

function PoseAnnouncement({ icon: Icon, label }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-white/95 backdrop-blur-md fade-in">
      <div className="bg-brand-50 text-brand-600 rounded-full p-10 shadow-xl">
        <Icon size={120} strokeWidth={2.4} />
      </div>
      <p className="text-4xl font-extrabold text-slate-900 tracking-tight text-center px-6">
        {label}
      </p>
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
