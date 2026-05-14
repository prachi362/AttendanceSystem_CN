// GET /api/stats — aggregate stats from the Workers tab + Sheet1 punch log.
import { ensureInit, setHeaders } from './_init.js'
import { listWorkers } from '../server/store/workers.js'
import { readSheet } from '../server/sync/google.js'

export default async function handler(req, res) {
  setHeaders(res)
  try {
    await ensureInit()
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

    const workers = await listWorkers()
    const clockedIn = workers.filter(w => w.currentState === 'in').length

    let punchRows = []
    try {
      const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
      const rows = await readSheet(tab)
      punchRows = rows.slice(1).filter(r => r && r[0])
    } catch (e) {
      console.warn('[api/stats] read Sheet1 failed:', e.message)
    }

    const todayPunches = punchRows.filter(r => {
      const ts = Date.parse(r[0])
      return Number.isFinite(ts) && ts >= startOfDay.getTime()
    }).length

    const last = punchRows[punchRows.length - 1] || null
    res.status(200).json({
      workers: workers.length,
      punches: punchRows.length,
      todayPunches,
      clockedIn,
      lastPunch: last ? {
        name: last[1] || 'Unknown',
        ts: Date.parse(last[0]) || Date.now(),
        direction: (last[3] || 'in').toLowerCase()
      } : null
    })
  } catch (e) {
    console.error('[api/stats]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
}
