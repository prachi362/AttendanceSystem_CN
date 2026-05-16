import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, UserPlus, ScanFace, Clock, Check } from 'lucide-react'
import CameraView from '../components/CameraView.jsx'
import Confetti from '../components/Confetti.jsx'
import { captureCompressedJpeg } from '../utils/image.js'
import { detectFace, bestDescriptor, bestMatch } from '../utils/face.js'
import { api } from '../utils/api.js'

export default function PunchScreen({ t, direction: requestedDir = null, onDone, onBack, onRegister }) {
  const camRef = useRef(null)
  // capture | identifying | success | unknown | cooldown
  const [stage, setStage] = useState('capture')
  const [photo, setPhoto] = useState(null)
  const [worker, setWorker] = useState(null)
  const [resultDirection, setResultDirection] = useState(requestedDir || 'in')
  const [cooldownInfo, setCooldownInfo] = useState(null)
  const [camReady, setCamReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [faceLocked, setFaceLocked] = useState(false)

  // Guard to ensure capture() only fires once per session.
  const capturingRef = useRef(false)

  // Live detection loop: wait for the user to settle in front of the camera
  // before capturing. We require:
  //   - a short warm-up after the stream becomes ready (lets the user frame)
  //   - several consecutive frames with a confident, sufficiently-large face
  //     (small/distant faces give bad descriptors)
  // Polls at ~5 fps with TinyFaceDetector (cheap on the client).
  useEffect(() => {
    if (stage !== 'capture' || !camReady) return
    let cancelled = false
    let consecutive = 0
    const WARMUP_MS = 1500            // give the user time to position
    const REQUIRED_CONSECUTIVE = 4    // ~720ms of steady face
    const MIN_FACE_FRAC = 0.22        // face box width >= 22% of frame width
    const startedAt = Date.now()

    async function tick() {
      if (cancelled || capturingRef.current) return
      const v = camRef.current?.getVideo()
      const elapsed = Date.now() - startedAt
      if (v && elapsed >= WARMUP_MS) {
        try {
          const det = await detectFace(v)
          const vw = v.videoWidth || 1
          const boxW = det?.box?.width || 0
          const bigEnough = boxW / vw >= MIN_FACE_FRAC
          if (det && det.score > 0.6 && bigEnough) {
            consecutive++
            if (consecutive === 1) setFaceLocked(true) // green outline = "hold still"
            if (consecutive >= REQUIRED_CONSECUTIVE) {
              capturingRef.current = true
              capture()
              return
            }
          } else {
            consecutive = 0
            setFaceLocked(false)
          }
        } catch (e) { /* keep polling */ }
      }
      if (!cancelled) setTimeout(tick, 180)
    }
    tick()
    return () => { cancelled = true }
  }, [stage, camReady])

  async function capture() {
    const video = camRef.current?.getVideo()
    const data = captureCompressedJpeg(video, { maxWidth: 480, quality: 0.6 })
    if (!data) return
    setFlash(true); setTimeout(() => setFlash(false), 280)
    setPhoto(data)
    setStage('identifying')

    // Try server-side recognition first. If the server returns 503
    // (tfjs-node not installed — e.g., local macOS dev), fall back to
    // browser-side recognition so dev still works.
    try {
      const r = await api.recognizeAndPunch(data, requestedDir)
      console.log('[punch] server response:', r)

      if (r.ok) {
        setWorker(r.worker)
        setResultDirection(r.direction || requestedDir || 'in')
        setStage('success')
        setTimeout(onDone, 3000)
        return
      }
      setStage('unknown')
    } catch (e) {
      if (e.status === 503) {
        // Server can't do face recognition — fall back to browser path.
        await browserSideFallback(data, video)
      } else if (e.status === 429) {
        setWorker(e.body?.worker || { name: 'Worker' })
        setResultDirection(e.body?.lastDirection || requestedDir || 'in')
        setCooldownInfo({
          reason: e.body?.reason,
          retryAfterMs: e.body?.retryAfterMs,
          lastPunchTs: e.body?.lastPunchTs
        })
        setStage('cooldown')
        // Give people time to actually read the message before going home.
        setTimeout(onDone, e.body?.reason === 'min_shift' ? 7000 : 2800)
      } else {
        console.warn('[punch] error:', e)
        setStage('unknown')
      }
    }
  }

  // Browser-side fallback: extract descriptor, match against workers list,
  // then call the regular /api/punches endpoint.
  async function browserSideFallback(data, video) {
    console.log('[punch] server unavailable — using browser fallback')
    try {
      const workers = await api.listWorkers()
      const d = await bestDescriptor({ video, dataUrl: data })
      if (!d) { setStage('unknown'); return }
      const match = bestMatch(workers, d, 0.60)
      if (!match) { setStage('unknown'); return }

      const r = await api.createPunch(
        match.worker.id, match.worker.name, data, match.distance, requestedDir
      )
      setWorker(match.worker)
      setResultDirection(r.punch?.direction || requestedDir || 'in')
      setStage('success')
      setTimeout(onDone, 3000)
    } catch (e) {
      if (e.status === 429) {
        setWorker(e.body?.worker || { name: 'Worker' })
        setResultDirection(e.body?.lastDirection || requestedDir || 'in')
        setCooldownInfo({
          reason: e.body?.reason,
          retryAfterMs: e.body?.retryAfterMs,
          lastPunchTs: e.body?.lastPunchTs
        })
        setStage('cooldown')
        setTimeout(onDone, e.body?.reason === 'min_shift' ? 7000 : 2800)
      } else {
        console.warn('[punch/fallback] error:', e)
        setStage('unknown')
      }
    }
  }

  function retry() {
    capturingRef.current = false
    setFaceLocked(false)
    setPhoto(null)
    setStage('capture')
  }

  if (stage === 'success' && worker) {
    return <SuccessScreen t={t} worker={worker} direction={resultDirection} />
  }

  if (stage === 'cooldown' && worker) {
    return (
      <CooldownScreen t={t} worker={worker} info={cooldownInfo} />
    )
  }

  if (stage === 'identifying') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 fade-in">
        <div className="relative bg-brand-50 text-brand-600 rounded-full p-8">
          <ScanFace size={72} strokeWidth={2} />
          <div className="absolute inset-0 rounded-full pulse-ring" />
        </div>
        <p className="text-xl text-slate-700" style={{ fontWeight: 600 }}>{t.identifying}</p>
      </div>
    )
  }

  if (stage === 'unknown') {
    return (
      <div className="flex-1 flex flex-col p-8 gap-6 fade-in">
        <Header onBack={onBack} title={t.punchIn} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <p className="text-slate-700 text-lg max-w-sm">{t.notRegisteredCta}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onRegister} className="btn-big btn-success flex items-center justify-center gap-3">
            <UserPlus size={24} /> {t.register}
          </button>
          <button onClick={retry} className="btn-big btn-ghost">
            {t.holdStill}
          </button>
        </div>
      </div>
    )
  }

  const title = t.punchIn

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 fade-in">
      <Header onBack={onBack} title={title} />

      <div className="text-center">
        <p className="text-xl text-slate-900" style={{ fontWeight: 600 }}>{t.pose_front}</p>
        <p className="text-slate-500 text-sm mt-1">{t.autoCapture}</p>
      </div>

      <CameraView
        ref={camRef}
        onReady={() => setCamReady(true)}
        className="flex-1 min-h-0"
        overlay={faceLocked ? (
          <div className="absolute inset-0 ring-4 ring-emerald-400/80 rounded-3xl pointer-events-none" />
        ) : null}
      />

      {flash && (
        <div className="pointer-events-none absolute inset-0 bg-white/80 rounded-3xl" style={{ animation: 'flash 280ms ease-out' }} />
      )}
    </div>
  )
}

// Shown when the server recognized the person but rejected the punch — either
// because of the 30-second debounce or the 30-minute minimum shift rule.
// Important: visually confirm "we did recognize you" so the user doesn't
// think recognition failed.
function CooldownScreen({ t, worker, info }) {
  const isMinShift = info?.reason === 'min_shift'
  const photoSrc = worker.thumb ? '/' + worker.thumb : null

  // Live-tick the remaining time so the countdown feels accurate.
  const target = info?.lastPunchTs ? info.lastPunchTs + 30 * 60 * 1000 : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isMinShift) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isMinShift])
  const msLeft = target ? Math.max(0, target - now) : (info?.retryAfterMs || 0)
  const mm = Math.floor(msLeft / 60000)
  const ss = Math.floor((msLeft % 60000) / 1000)
  const clock = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`

  return (
    <div className="flex-1 relative flex flex-col items-center justify-center gap-6 p-8 fade-in overflow-hidden">
      {/* Photo with a green check badge — makes it obvious recognition worked. */}
      <div className="relative">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={worker.name}
            className="w-44 h-44 rounded-full object-cover ring-8 ring-amber-400"
            style={{ boxShadow: '0 20px 50px -20px rgba(15,23,42,0.3)' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="w-44 h-44 rounded-full bg-slate-100 ring-8 ring-amber-400 flex items-center justify-center text-5xl text-slate-400" style={{ fontWeight: 600 }}>
            {worker.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white rounded-full p-2 ring-4 ring-white">
          <Check size={22} strokeWidth={3} />
        </div>
      </div>

      <div className="text-3xl text-slate-900" style={{ fontWeight: 600 }}>{worker.name}</div>

      {isMinShift ? (
        <>
          {/* Primary message: clearly tell the user they're already in for the day. */}
          <p className="text-xl text-slate-800 text-center max-w-sm" style={{ fontWeight: 600 }}>
            {t.alreadyPunchedIn}
          </p>
          {/* Secondary line + live countdown clock showing when they can check out. */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-slate-500 text-sm">{t.minShiftBlocked}</p>
            <div className="flex items-center gap-3 bg-amber-50 text-amber-700 px-5 py-3 rounded-2xl">
              <Clock size={26} strokeWidth={2.2} />
              <span className="text-3xl tabular-nums" style={{ fontWeight: 600 }}>{clock}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-slate-500 text-center max-w-sm">{t.cooldown}</p>
      )}
    </div>
  )
}

function SuccessScreen({ t, worker, direction }) {
  // Show a small notice on a successful CHECK-IN that they can check out in 30 min.
  const isIn = direction === 'in'
  const photoSrc = worker.thumb ? '/' + worker.thumb : null
  const ringColor = isIn ? 'ring-emerald-500' : 'ring-blue-500'
  const badgeBg = isIn ? 'bg-emerald-500' : 'bg-blue-500'

  return (
    <div className="flex-1 relative flex flex-col items-center justify-center gap-7 p-8 fade-in overflow-hidden">
      <Confetti count={28} />
      {photoSrc ? (
        <img
          src={photoSrc}
          alt={worker.name}
          className={`w-56 h-56 rounded-full object-cover ring-8 ${ringColor}`}
          style={{ boxShadow: '0 20px 50px -20px rgba(15,23,42,0.3)' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className={`w-56 h-56 rounded-full bg-slate-100 ring-8 ${ringColor} flex items-center justify-center text-5xl text-slate-400`} style={{ fontWeight: 600 }}>
          {worker.name?.[0]?.toUpperCase() || '?'}
        </div>
      )}

      <div className={`px-8 py-3 rounded-full text-white text-3xl tracking-widest ${badgeBg}`} style={{ fontWeight: 600 }}>
        {isIn ? t.inLabel : t.outLabel}
      </div>

      <div className="text-center">
        <div className="text-3xl text-slate-900" style={{ fontWeight: 600 }}>{worker.name}</div>
        <div className="text-slate-500 mt-2 tabular-nums">{new Date().toLocaleTimeString()}</div>
        {isIn && (
          <div className="text-slate-400 text-sm mt-3">{t.minShiftNotice}</div>
        )}
      </div>
    </div>
  )
}

function Header({ onBack, title }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition" style={{ transition: 'background-color 200ms cubic-bezier(0.2,0.7,0.2,1)' }}>
        <ArrowLeft size={22} />
      </button>
      <h2 className="text-xl text-slate-900" style={{ fontWeight: 600 }}>{title}</h2>
    </div>
  )
}
