// POST /api/punches — record a punch and log it to the sheet.
// GET  /api/punches — returns [] (no local log on Vercel — sheet is source).
//
// Stateless mode: we don't save the photo or write a local punch log;
// we just append a row to Sheet1 and update the worker's currentState.

import { ensureInit, uid, setHeaders } from './_init.js'
import { listWorkers, updateWorkerState } from '../server/store/workers.js'
import { appendRow } from '../server/sync/google.js'

const PUNCH_COOLDOWN_MS = 60 * 1000

export default async function handler(req, res) {
  setHeaders(res)
  try {
    await ensureInit()

    if (req.method === 'GET') return res.status(200).json([])

    if (req.method === 'POST') {
      const { workerId, name, distance } = req.body || {}
      if (!workerId) return res.status(400).json({ error: 'workerId required' })

      const ts = Date.now()
      const workers = await listWorkers()
      const worker = workers.find(w => w.id === workerId)

      if (worker && worker.lastPunchTs && (ts - worker.lastPunchTs) < PUNCH_COOLDOWN_MS) {
        return res.status(429).json({
          error: 'cooldown',
          lastPunchTs: worker.lastPunchTs,
          lastDirection: worker.currentState || 'in',
          retryAfterMs: PUNCH_COOLDOWN_MS - (ts - worker.lastPunchTs)
        })
      }

      const prevState = worker?.currentState || 'out'
      const direction = prevState === 'in' ? 'out' : 'in'

      const punch = {
        id: uid(),
        workerId,
        employeeId: worker?.employeeId || null,
        name: name || worker?.name || 'Unknown',
        direction,
        ts,
        distance: typeof distance === 'number' ? distance : null
      }

      // 1. Append punch row (Sheet1).
      try {
        await appendRow([
          new Date(ts).toISOString(),
          punch.name,
          punch.employeeId || '',
          direction.toUpperCase(),
          '', // photo column — empty in stateless mode
          workerId,
          typeof distance === 'number' ? Number(distance.toFixed(4)) : ''
        ])
      } catch (e) {
        console.warn('[api/punches] sheet append failed:', e.message)
      }

      // 2. Update worker state in Workers tab.
      if (worker) {
        try { await updateWorkerState(worker.id, direction, ts) }
        catch (e) { console.warn('[api/punches] updateWorkerState failed:', e.message) }
      }

      return res.status(200).json({ ok: true, punch })
    }

    res.status(405).json({ error: 'method_not_allowed' })
  } catch (e) {
    console.error('[api/punches]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
}
