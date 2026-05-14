import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, User, ArrowLeftCircle, ArrowRightCircle, Camera } from 'lucide-react'
import CameraView from '../components/CameraView.jsx'
import Confetti from '../components/Confetti.jsx'
import { useCountdown, CountdownBadge } from '../components/Countdown.jsx'
import { captureCompressedJpeg } from '../utils/image.js'
import { bestDescriptor, bestMatch } from '../utils/face.js'
import { api } from '../utils/api.js'

const STEPS = ['front', 'left', 'right']
const STEP_ICONS = { front: User, left: ArrowLeftCircle, right: ArrowRightCircle }

export default function RegisterScreen({ t, onDone, onBack, onPunched }) {
  const camRef = useRef(null)
  // info | glasses | capture | saving | done | duplicate
  const [stage, setStage] = useState('info')
  const [name, setName] = useState('')
  const [empId, setEmpId] = useState('')
  const [stepIdx, setStepIdx] = useState(0)
  const [photos, setPhotos] = useState({})
  const descriptorsRef = useRef([])
  const [camReady, setCamReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [announcing, setAnnouncing] = useState(true)
  const [savedWorker, setSavedWorker] = useState(null)
  const [existingWorkers, setExistingWorkers] = useState([])

  const stepKey = STEPS[stepIdx]
  const poseLabel = t[`pose_${stepKey}`]
  const StepIcon = STEP_ICONS[stepKey] || Camera

  useEffect(() => { api.listWorkers().then(setExistingWorkers).catch(() => {}) }, [])

  useEffect(() => {
    if (stage !== 'capture') return
    setAnnouncing(true)
    const id = setTimeout(() => setAnnouncing(false), 1200)
    return () => clearTimeout(id)
  }, [stage, stepIdx])

  async function capture() {
    const video = camRef.current?.getVideo()
    const data = captureCompressedJpeg(video, { maxWidth: 480, quality: 0.7 })
    if (!data) return
    setFlash(true); setTimeout(() => setFlash(false), 280)
    const next = { ...photos, [stepKey]: data }
    setPhotos(next)

    let d = null
    try { d = await bestDescriptor({ video, dataUrl: data }) } catch {}
    if (d) descriptorsRef.current.push(d)

    // Duplicate check on the first (front) pose only — if matches existing, punch them instead.
    if (stepIdx === 0 && d) {
      const match = bestMatch(existingWorkers, d, 0.5)
      if (match) {
        setStage('duplicate')
        setSavedWorker(match.worker)
        try { await api.createPunch(match.worker.id, match.worker.name, data) } catch {}
        setTimeout(() => { onPunched ? onPunched() : onDone() }, 2600)
        return
      }
    }

    if (stepIdx + 1 < STEPS.length) {
      setTimeout(() => setStepIdx(stepIdx + 1), 300)
    } else {
      setStage('saving')
      try {
        const r = await api.createWorker({
          name: name.trim(),
          employeeId: empId.trim() || null,
          photos: next,
          descriptor: descriptorsRef.current[0] || null,
          descriptors: descriptorsRef.current
        })
        setSavedWorker({ ...r.worker, thumb: r.worker?.folder ? `${r.worker.folder}/front.jpg` : null })
        setStage('done')
      } catch (e) {
        console.error(e)
        setStage('capture')
      }
    }
  }

  const countdownActive = stage === 'capture' && camReady && !announcing
  const n = useCountdown({ from: 3, active: countdownActive, resetKey: stepIdx, onDone: capture })

  if (stage === 'info') {
    return (
      <div className="flex-1 flex flex-col p-8 gap-6 fade-in">
        <Header onBack={onBack} title={t.register} />
        <ProgressDots total={STEPS.length + 1} current={0} />

        <div className="flex-1 flex flex-col justify-center gap-5">
          <Field label={t.fullName}>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="input"
            />
          </Field>
          <Field label={t.employeeId}>
            <input
              value={empId}
              onChange={e => setEmpId(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <button
          disabled={!name.trim()}
          onClick={() => setStage('capture')}
          className="btn-big btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >{t.next}</button>
      </div>
    )
  }

  if (stage === 'duplicate' && savedWorker) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 fade-in">
        <div className="bg-emerald-100 text-emerald-700 rounded-full p-6">
          <Check size={56} strokeWidth={2.4} />
        </div>
        <p className="text-2xl text-slate-900 text-center" style={{ fontWeight: 600 }}>
          {t.alreadyRegistered}
        </p>
        <p className="text-slate-500 text-center">{savedWorker.name}</p>
        <p className="text-slate-400 text-sm">{t.alreadyPunching}</p>
      </div>
    )
  }

  if (stage === 'done' && savedWorker) {
    const photoSrc = photos.front || (savedWorker.thumb ? '/' + savedWorker.thumb : null)
    return (
      <div className="flex-1 relative flex flex-col items-center justify-center gap-6 p-8 fade-in overflow-hidden">
        <Confetti count={22} />
        {photoSrc && (
          <img src={photoSrc} alt={savedWorker.name}
            className="w-44 h-44 rounded-full object-cover ring-8 ring-emerald-500"
            style={{ boxShadow: '0 20px 50px -20px rgba(15,23,42,0.3)' }} />
        )}
        <p className="text-2xl text-slate-900 text-center" style={{ fontWeight: 600 }}>
          {t.registered}, {savedWorker.name}
        </p>
        <button onClick={onDone} className="btn-big btn-primary mt-4">{t.done}</button>
      </div>
    )
  }

  // capture / saving
  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 fade-in relative">
      <Header onBack={onBack} title={`${t.step} ${stepIdx + 1} / ${STEPS.length}`} />
      <ProgressDots total={STEPS.length + 1} current={1 + stepIdx} />

      {announcing && <PoseAnnouncement icon={StepIcon} label={poseLabel} />}

      <CameraView
        ref={camRef}
        onReady={() => setCamReady(true)}
        className="flex-1 min-h-0"
        overlay={countdownActive ? <CountdownBadge n={n} flash={flash} /> : null}
      />

      <p className="text-center text-slate-500 text-sm">{stage === 'saving' ? t.saving : t.autoCapture}</p>
    </div>
  )
}

function PoseAnnouncement({ icon: Icon, label }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-white/95 fade-in">
      <div className="bg-brand-50 text-brand-600 rounded-full p-8">
        <Icon size={88} strokeWidth={2} />
      </div>
      <p className="text-3xl text-slate-900 text-center px-6" style={{ fontWeight: 600 }}>{label}</p>
    </div>
  )
}

function ProgressDots({ total, current }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i <= current ? 'bg-brand-600 w-8' : 'bg-slate-200 w-4'}`} style={{ transitionDuration: '200ms' }} />
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-center text-base uppercase tracking-widest text-slate-500" style={{ fontWeight: 500 }}>{label}</span>
      <div className="mt-3">{children}</div>
    </label>
  )
}

function Header({ onBack, title }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
        <ArrowLeft size={22} />
      </button>
      <h2 className="text-xl text-slate-900" style={{ fontWeight: 600 }}>{title}</h2>
    </div>
  )
}
