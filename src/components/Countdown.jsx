import { useEffect, useRef, useState } from 'react'

// Hook: starts a countdown when `active` flips true.
// Calls onDone() when it reaches 0. Resets if `key` changes.
export function useCountdown({ from = 3, active = false, onDone, resetKey }) {
  const [n, setN] = useState(from)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!active) { setN(from); return }
    setN(from)
    let cur = from
    const id = setInterval(() => {
      cur -= 1
      if (cur <= 0) {
        clearInterval(id)
        setN(0)
        doneRef.current && doneRef.current()
      } else {
        setN(cur)
      }
    }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resetKey, from])

  return n
}

export function CountdownBadge({ n, flash }) {
  if (n == null) return null
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        key={n}
        className="text-white font-extrabold tabular-nums"
        style={{
          fontSize: 'clamp(80px, 22vw, 180px)',
          textShadow: '0 6px 30px rgba(0,0,0,0.55)',
          animation: 'pop 700ms ease-out both'
        }}
      >
        {n > 0 ? n : ''}
      </div>
      {flash && <div className="absolute inset-0 bg-white animate-[flash_300ms_ease-out_forwards]" />}
      <style>{`
        @keyframes pop {
          0% { transform: scale(0.6); opacity: 0; }
          30% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes flash {
          0% { opacity: 0.85; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
