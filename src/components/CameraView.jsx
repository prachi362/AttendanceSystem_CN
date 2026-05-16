import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

const CameraView = forwardRef(function CameraView({ onError, onReady, overlay, aspect = null, className = '' }, ref) {
  const videoRef = useRef(null)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    getVideo: () => videoRef.current
  }))

  useEffect(() => {
    let stream
    async function start() {
      try {
        // Ask for a wide native frame (most webcams are landscape sensors).
        // Combined with `object-contain` below, this avoids the cropped /
        // "zoomed in" look when someone stands close to the kiosk.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width:  { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 }
          },
          audio: false
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
          onReady && onReady()
        }
      } catch (e) {
        console.error('[camera]', e)
        onError && onError(e)
      }
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [onError])

  return (
    <div
      className={`relative w-full bg-slate-900 rounded-3xl overflow-hidden ring-1 ring-black/10 shadow-2xl ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: 'scaleX(-1)', WebkitTransform: 'scaleX(-1)' }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Face guide */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className="rounded-full border-[3px] border-white/90 pulse-ring"
          style={{ width: '58%', height: '68%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }}
        />
      </div>

      {/* Corner brackets */}
      <Corners />

      {overlay}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80">
          <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      )}
    </div>
  )
})

function Corners() {
  const base = 'absolute w-10 h-10 border-white/80'
  return (
    <>
      <div className={`${base} top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl-2xl`} />
      <div className={`${base} top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr-2xl`} />
      <div className={`${base} bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl-2xl`} />
      <div className={`${base} bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br-2xl`} />
    </>
  )
}

export default CameraView
