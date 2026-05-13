import { useEffect, useState } from 'react'

export default function Clock({ lang = 'en', className = '' }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15)
    return () => clearInterval(id)
  }, [])
  const locale = lang === 'es' ? 'es-ES' : 'en-US'
  const time = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className={className}>
      <div className="text-6xl font-extrabold tracking-tight tabular-nums">{time}</div>
      <div className="text-base font-medium opacity-80 capitalize mt-1">{date}</div>
    </div>
  )
}
