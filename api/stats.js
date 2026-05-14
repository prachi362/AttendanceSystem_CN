// GET /api/stats — aggregate stats from the Workers tab (and best-effort from punches log).
import { ensureInit, setHeaders } from './_init.js'
import { listWorkers } from '../server/store/workers.js'

export default async function handler(req, res) {
  setHeaders(res)
  try {
    await ensureInit()
    const workers = await listWorkers()
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const clockedIn = workers.filter(w => w.currentState === 'in').length
    const todayPunches = workers.filter(w => w.lastPunchTs && w.lastPunchTs >= startOfDay.getTime()).length
    res.status(200).json({
      workers: workers.length,
      punches: 0,           // not tracked stateless — see sheet for full log
      todayPunches,
      clockedIn,
      lastPunch: null
    })
  } catch (e) {
    console.error('[api/stats]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
}
