import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, UserPlus, ScanFace } from 'lucide-react'
import CameraView from '../components/CameraView.jsx'
import Confetti from '../components/Confetti.jsx'
import { captureCompressedJpeg } from '../utils/image.js'
import { bestDescriptor, bestMatch, detectFace } from '../utils/face.js'
import { api } from '../utils/api.js'

export default function PunchScreen({ t, direction: requestedDir = null, onDone, onBack, onRegister }) {
  const camRef = useRef(null)
  // capture | identifying | success | unknown | cooldown
  const [stage, setStage] = useState('capture')
  const [photo, setPhoto] = useState(null)
  const [worker, setWorker] = useState(null)
  const [resultDirection, setResultDirection] = useState(requestedDir || 'in')
  const [workers, setWorkers] = useState([])
  const [workersLoaded, setWorkersLoaded] = useState(false)
  const [camReady, setCamReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [faceLocked, setFaceLocked] = useState(false)

  // Guard to ensure capture() only fires once per session.
  const capturingRef = useRef(false)

  useEffect(() => {
    api.listWorkers()
      .then(ws => { setWorkers(ws); setWorkersLoaded(true) })
      .catch(() => { setWorkers([]); setWorkersLoaded(true) })
  }, [])

  // Live detection loop: as soon as a face is detected in the live preview,
  // immediately fire capture(). Polls at ~5 fps with TinyFaceDetector (cheap).
  useEffect(() => {
    if (stage !== 'capture' || !camReady || !workersLoaded) return
    let cancelled = false
    let consecutive = 0  // require 2 in a row to reduce false triggers on flicker

    async function tick() {
      if (cancelled || capturingRef.current) return
      const v = camRef.current?.getVideo()
      if (v) {
        try {
          const det = await detectFace(v)
          if (det && det.score > 0.55) {
            consecutive++
            if (consecutive >= 2) {
              capturingRef.current = true
              setFaceLocked(true)
              capture()
              return
            }
          } else {
            consecutive = 0
          }
        } catch (e) { /* keep polling */ }
      }
      if (!cancelled) setTimeout(tick, 180)
    }
    tick()
    return () => { cancelled = true }
  }, [stage, camReady, workersLoaded])

  async function capture() {
    const video = camRef.current?.getVideo()
    const data = captureCompressedJpeg(video, { maxWidth: 480, quality: 0.6 })
    if (!data) return
    setFlash(true); setTimeout(() => setFlash(false), 280)
    setPhoto(data)
    setStage('identifying')

    // Sample up to 4 frames over ~1.2s using the SAME detector that registration
    // used (SSD MobileNet). Using a different detector here gives subtly different
    // face crops, which throws off matching even for the correct person.
    const THRESHOLD = 0.60
    const ATTEMPTS = 4
    const INTERVAL = 300

    let bestSoFar = null
    try {
      const d0 = await bestDescriptor({ video, dataUrl: data })
      if (d0) {
        const m = bestMatch(workers, d0, 1.0)
        if (m && (!bestSoFar || m.distance < bestSoFar.distance)) bestSoFar = m
      }

      for (let i = 1; i < ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, INTERVAL))
        const v = camRef.current?.getVideo()
        if (!v) continue
        const d = await bestDescriptor({ video: v })
        if (!d) continue
        const m = bestMatch(workers, d, 1.0)
        if (m && (!bestSoFar || m.distance < bestSoFar.distance)) bestSoFar = m
        if (bestSoFar && bestSoFar.distance < 0.40) break  // confident — stop early
      }
    } catch (e) {
      console.warn('[punch] descriptor error:', e)
    }

    console.log('[punch] candidates:', workers.length, '— best match:', bestSoFar
      ? { name: bestSoFar.worker.name, distance: bestSoFar.distance.toFixed(4) }
      : null)

    if (!bestSoFar || bestSoFar.distance > THRESHOLD) {
      setStage('unknown')
      return
    }

    const match = bestSoFar
    try {
      const r = await api.createPunch(match.worker.id, match.worker.name, data, match.distance, requestedDir)
      setWorker(match.worker)
      setResultDirection(r.punch?.direction || requestedDir)
      setStage('success')
      setTimeout(onDone, 3000)
    } catch (e) {
      if (e.status === 429) {
        setWorker(match.worker)
        setResultDirection(e.body?.lastDirection || requestedDir)
        setStage('cooldown')
        setTimeout(onDone, 2800)
      } else {
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
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 fade-in">
        <div className="text-slate-900 text-2xl" style={{ fontWeight: 600 }}>{worker.name}</div>
        <p className="text-slate-500 text-center max-w-sm">{t.cooldown}</p>
      </div>
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

function SuccessScreen({ t, worker, direction }) {
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
        />
      ) : (
        <div className={`w-56 h-56 rounded-full bg-slate-100 ring-8 ${ringColor}`} />
      )}

      <div className={`px-8 py-3 rounded-full text-white text-3xl tracking-widest ${badgeBg}`} style={{ fontWeight: 600 }}>
        {isIn ? t.inLabel : t.outLabel}
      </div>

      <div className="text-center">
        <div className="text-3xl text-slate-900" style={{ fontWeight: 600 }}>{worker.name}</div>
        <div className="text-slate-500 mt-2 tabular-nums">{new Date().toLocaleTimeString()}</div>
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
