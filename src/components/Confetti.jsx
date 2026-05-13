// Small, soft confetti burst — short, no sound, no big fanfare.
import { useMemo } from 'react'

const COLORS = ['#2563eb', '#059669', '#f59e0b', '#0ea5e9', '#a855f7']

export default function Confetti({ count = 30 }) {
  const pieces = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 300,
    duration: 1400 + Math.random() * 600,
    rotate: Math.random() * 360,
    color: COLORS[i % COLORS.length],
  })), [count])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animationDuration: `${p.duration}ms`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}
