// POST /api/recognize-and-punch — Vercel serverless version.
// Same contract as the Express endpoint but Sheets-only (no local FS).
import { ensureInit, uid, setHeaders } from './_init.js'
import { listWorkers, updateWorkerState } from '../server/store/workers.js'
import { appendRow } from '../server/sync/google.js'
import { descriptorFromImage, bestMatch, loadModels } from '../server/face/recognition.js'

const PUNCH_COOLDOWN_MS = 30 * 60 * 1000

export default async function handler(req, res) {
  setHeaders(res)
  const t0 = Date.now()
  try {
    await ensureInit()

    // GET = warm-up probe (call from a cron job to keep cold starts away).
    if (req.method === 'GET') {
      await loadModels()
      return res.status(200).json({ ok: true, warmed: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const { photo, direction: requestedDirection, localTime } = req.body || {}
    if (!photo) return res.status(400).json({ error: 'photo (data URL) required' })

    // Pull workers + run recognition in parallel.
    const [workers, descriptor] = await Promise.all([
      listWorkers(),
      descriptorFromImage(photo)
    ])

    if (!descriptor) return res.json({ ok: false, reason: 'no_face', tookMs: Date.now() - t0 })

    const match = bestMatch(workers, descriptor, 0.60)
    if (!match) return res.json({ ok: false, reason: 'unknown', tookMs: Date.now() - t0 })

    const ts = Date.now()
    const worker = match.worker

    if (worker.lastPunchTs && (ts - worker.lastPunchTs) < PUNCH_COOLDOWN_MS) {
      return res.status(429).json({
        error: 'cooldown',
        lastPunchTs: worker.lastPunchTs,
        lastDirection: worker.currentState || 'in',
        retryAfterMs: PUNCH_COOLDOWN_MS - (ts - worker.lastPunchTs),
        worker: { id: worker.id, name: worker.name }
      })
    }

    const prevState = worker.currentState || 'out'
    const direction = (requestedDirection === 'in' || requestedDirection === 'out')
      ? requestedDirection
      : (prevState === 'in' ? 'out' : 'in')

    // Append punch row to Sheet1.
    try {
      await appendRow([
        localTime || new Date(ts).toISOString(),
        worker.name || 'Unknown',
        worker.employeeId || '',
        direction.toUpperCase(),
        '', // photo column — empty (Vercel doesn't persist photos)
        worker.id,
        Number(match.distance.toFixed(4))
      ])
    } catch (e) { console.warn('[recognize-and-punch] sheet append failed:', e.message) }

    // Update worker state.
    try { await updateWorkerState(worker.id, direction, ts) }
    catch (e) { console.warn('[recognize-and-punch] updateWorkerState failed:', e.message) }

    return res.json({
      ok: true,
      worker: { id: worker.id, name: worker.name, employeeId: worker.employeeId, thumb: '' },
      direction,
      distance: match.distance,
      tookMs: Date.now() - t0
    })
  } catch (e) {
    console.error('[recognize-and-punch]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
}

// Bigger body limit for base64-encoded JPEGs.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } } }
