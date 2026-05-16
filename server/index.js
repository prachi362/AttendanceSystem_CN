// Minimal Express backend for the attendance kiosk.
// Saves registration photos under data/workers/<id>_<safeName>/{front,up,down,left,right}.jpg
// Saves punch photos under data/punches/YYYY-MM-DD/<ts>_<workerId>.jpg
// Stores metadata in data/db.json
//
// Run: npm run server     (port 5174)
// Dev: npm run dev:all    (vite + server together)

import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initOutbox, enqueuePunch, outboxStatus } from './sync/outbox.js'
import { initWorkerStore, listWorkers as storeListWorkers, createWorker as storeCreateWorker, updateWorkerState } from './store/workers.js'
import { syncEnabled, readSheet } from './sync/google.js'
import { descriptorFromImage, loadModels } from './face/recognition.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const WORKERS_DIR = path.join(DATA_DIR, 'workers')
const PUNCHES_DIR = path.join(DATA_DIR, 'punches')
const DB_FILE = path.join(DATA_DIR, 'db.json')

for (const d of [DATA_DIR, WORKERS_DIR, PUNCHES_DIR]) fs.mkdirSync(d, { recursive: true })
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ workers: [], punches: [] }, null, 2))

const app = express()
app.use(express.json({ limit: '20mb' }))

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
}
function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}
function safe(name) {
  return String(name || '').trim().replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'worker'
}
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!m) return null
  return Buffer.from(m[1], 'base64')
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
function dateFolder(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// --- Workers ---------------------------------------------------------------

app.get('/api/workers', async (_req, res) => {
  try {
    const workers = await storeListWorkers()
    res.json(workers.map(w => ({
      id: w.id, name: w.name, employeeId: w.employeeId || null,
      createdAt: w.createdAt, folder: w.folder, thumb: w.thumb,
      descriptor: w.descriptor || null,
      descriptors: w.descriptors || null,
      currentState: w.currentState || 'out',
      lastPunchTs: w.lastPunchTs || null
    })))
  } catch (e) {
    console.error('[api/workers]', e)
    res.status(500).json({ error: 'workers_unavailable' })
  }
})

app.post('/api/workers', async (req, res) => {
  const { name, employeeId, photos, descriptor, descriptors, kind: rawKind } = req.body || {}
  if (!name || !photos || !photos.front) {
    return res.status(400).json({ error: 'name and photos.front are required' })
  }
  const kind = rawKind === 'employee' ? 'employee' : 'worker'
  const id = uid()
  const folderName = `${id}_${safe(name)}`
  const folder = path.join(WORKERS_DIR, folderName)
  fs.mkdirSync(folder, { recursive: true })

  const saved = {}
  for (const pose of ['front', 'left', 'right']) {
    const buf = dataUrlToBuffer(photos[pose])
    if (!buf) continue
    const filename = `${pose}.jpg`
    fs.writeFileSync(path.join(folder, filename), buf)
    saved[pose] = `data/workers/${folderName}/${filename}`
  }

  // If the client did not pre-compute descriptors, extract them server-side
  // (only works when tfjs-node is installed — silently no-ops otherwise).
  let finalDescriptors = Array.isArray(descriptors)
    ? descriptors.filter(d => Array.isArray(d) && d.length)
    : null
  if ((!finalDescriptors || !finalDescriptors.length) && photos) {
    finalDescriptors = []
    for (const pose of ['front', 'left', 'right']) {
      if (!photos[pose]) continue
      try {
        const d = await descriptorFromImage(photos[pose])
        if (d) finalDescriptors.push(d)
      } catch (e) {
        // tfjs-node missing locally — skip silently. Client should send descriptors.
        if (e.message?.includes('tfjs-node') || e.code === 'ERR_MODULE_NOT_FOUND') break
        console.warn(`[register] descriptor for ${pose} failed:`, e.message)
      }
    }
    if (!finalDescriptors.length) finalDescriptors = null
  }

  const worker = {
    id,
    name: String(name).trim(),
    employeeId: employeeId ? String(employeeId).trim() : null,
    kind,
    createdAt: Date.now(),
    folder: `data/workers/${folderName}`,
    thumb: saved.front || null,
    photos: saved,
    descriptor: Array.isArray(descriptor) ? descriptor : (finalDescriptors?.[0] || null),
    descriptors: finalDescriptors,
    currentState: 'out',
    lastPunchTs: null,
    deactivated: false
  }
  try {
    await storeCreateWorker(worker)
  } catch (e) {
    console.error('[api/workers POST]', e)
  }
  res.json({ ok: true, worker: { id: worker.id, name: worker.name, kind: worker.kind, employeeId: worker.employeeId, folder: worker.folder, thumb: worker.thumb } })
})

// --- Punches ---------------------------------------------------------------

// Returns the punch log. Source of truth is Sheet1 in Google Sheets so that
// data survives Azure redeploys (which wipe the local `data/` folder). Falls
// back to the local db.json if Sheets isn't reachable.
app.get('/api/punches', async (req, res) => {
  const { limit = 200 } = req.query
  const n = Math.max(1, Math.min(2000, Number(limit) || 200))

  if (syncEnabled()) {
    try {
      const list = await readPunchesFromSheet(n)
      return res.json(list)
    } catch (e) {
      console.warn('[api/punches] sheet read failed, falling back to local db:', e.message)
    }
  }

  const db = readDB()
  const list = db.punches.slice(-n).reverse()
  res.json(list)
})

// Parse Sheet1 into the punch shape the dashboard expects.
// Sheet columns: A=ts | B=name | C=empId | D=dir | E=photo(HYPERLINK) | F=workerId | G=distance | H=kind | I=hours
async function readPunchesFromSheet(limit) {
  const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
  // We read formulas so we can extract the Drive URL out of =HYPERLINK("url","photo").
  const rows = await readSheet(tab, 'formula')
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const ts = Date.parse(String(r[0]).includes('T') ? r[0] : String(r[0]).replace(' ', 'T'))
    if (!Number.isFinite(ts)) continue
    const photoCell = r[4] || ''
    let photoUrl = ''
    const m = typeof photoCell === 'string' && photoCell.match(/HYPERLINK\("([^"]+)"/i)
    if (m) photoUrl = m[1]
    else if (typeof photoCell === 'string' && /^https?:\/\//i.test(photoCell)) photoUrl = photoCell

    const distance = parseFloat(r[6])
    const hours = parseFloat(r[8])
    out.push({
      id: `${ts}_${r[5] || ''}`,
      ts,
      name: r[1] || 'Unknown',
      employeeId: r[2] || null,
      direction: String(r[3] || 'in').toLowerCase() === 'out' ? 'out' : 'in',
      photoUrl: photoUrl || null,
      workerId: r[5] || null,
      distance: Number.isFinite(distance) ? distance : null,
      kind: (String(r[7] || '').toLowerCase() === 'employee') ? 'employee' : 'worker',
      hoursWorked: Number.isFinite(hours) ? hours : null
    })
  }
  // Newest first, capped at limit.
  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, limit)
}

// Punch policy:
//   - DEBOUNCE: same direction within 30 s = ignored (accidental double tap)
//   - MIN_SHIFT: after a CHECK-IN you must wait 30 min before you can CHECK-OUT
//   - check-OUT → check-IN is always allowed immediately (worker can rejoin)
const DEBOUNCE_MS  = 30 * 1000
const MIN_SHIFT_MS = 30 * 60 * 1000

// Decide whether a new punch should be rejected. Returns null if allowed,
// otherwise an object describing the cooldown reason for the API response.
function cooldownReason(worker, ts, direction) {
  if (!worker || !worker.lastPunchTs) return null
  const since = ts - worker.lastPunchTs
  // Same direction within debounce window → ignore double-tap.
  if (worker.currentState === direction && since < DEBOUNCE_MS) {
    return { kind: 'debounce', retryAfterMs: DEBOUNCE_MS - since }
  }
  // Trying to check OUT before the 30-minute minimum shift has elapsed.
  if (worker.currentState === 'in' && direction === 'out' && since < MIN_SHIFT_MS) {
    return { kind: 'min_shift', retryAfterMs: MIN_SHIFT_MS - since }
  }
  return null
}

app.post('/api/punches', async (req, res) => {
  const { workerId, name, photo, distance, direction: requestedDirection, localTime } = req.body || {}
  const buf = dataUrlToBuffer(photo)
  if (!buf) return res.status(400).json({ error: 'photo (data URL) required' })

  const ts = Date.now()
  const db = readDB()
  const worker = db.workers.find(w => w.id === workerId)

  // Determine the punch direction first so we can compare with the previous one.
  const prevState = worker?.currentState || 'out'
  const direction = (requestedDirection === 'in' || requestedDirection === 'out')
    ? requestedDirection
    : (prevState === 'in' ? 'out' : 'in')

  const cd = cooldownReason(worker, ts, direction)
  if (cd) {
    return res.status(429).json({
      error: 'cooldown',
      reason: cd.kind,
      lastPunchTs: worker.lastPunchTs,
      lastDirection: worker.currentState,
      retryAfterMs: cd.retryAfterMs,
      worker: { id: worker.id, name: worker.name }
    })
  }

  // Hours worked: only meaningful on a check-OUT after a prior check-IN.
  const hoursWorked = (direction === 'out' && prevState === 'in' && worker?.lastPunchTs)
    ? (ts - worker.lastPunchTs) / 3_600_000
    : null

  const dayFolder = path.join(PUNCHES_DIR, dateFolder(ts))
  fs.mkdirSync(dayFolder, { recursive: true })
  const filename = `${ts}_${safe(workerId || 'unknown')}.jpg`
  const rel = `data/punches/${dateFolder(ts)}/${filename}`
  fs.writeFileSync(path.join(dayFolder, filename), buf)

  const punch = {
    id: uid(),
    workerId: workerId || null,
    employeeId: worker?.employeeId || null,
    kind: worker?.kind || 'worker',
    name: name || 'Unknown',
    direction,
    ts,
    localTime: localTime || null,  // formatted local-time string from the client
    photo: rel,
    photoAbs: path.join(dayFolder, filename),  // for the sync worker
    distance: typeof distance === 'number' ? distance : null,
    hoursWorked,
    sizeBytes: buf.length
  }
  db.punches.push(punch)
  if (worker) {
    worker.currentState = direction
    worker.lastPunchTs = ts
  }
  writeDB(db)

  // Sync the worker's new state back to the Workers tab in Sheets (best-effort).
  if (worker) {
    updateWorkerState(worker.id, direction, ts).catch(e =>
      console.warn('[store] updateWorkerState bg failed:', e.message)
    )
  }

  // Best-effort: push the punch row to Sheets/Drive in the background.
  try { enqueuePunch(punch) } catch (e) { console.warn('[sync] enqueue failed:', e.message) }

  res.json({ ok: true, punch })
})

// --- Recognize + punch in one call (server-side face processing) -----------
//
// The browser captures a JPEG and POSTs it here. We:
//   1. Extract the descriptor on the CPU (no browser-WebGL load)
//   2. Match against all workers
//   3. If matched, record the punch (same logic as POST /api/punches)
//
// This is the path the kiosk should use; it removes ~2s of browser freeze
// per punch and works on weak hardware.
app.post('/api/recognize-and-punch', async (req, res) => {
  const t0 = Date.now()
  const { photo, direction: requestedDirection, localTime } = req.body || {}
  const buf = dataUrlToBuffer(photo)
  if (!buf) return res.status(400).json({ error: 'photo (data URL) required' })

  try {
    // 1. Workers + recognition in parallel.
    const workersPromise = storeListWorkers()
    let descriptor = null
    try {
      descriptor = await descriptorFromImage(buf)
    } catch (e) {
      // tfjs-node not installed (local macOS dev). Tell the client to fall back.
      if (e.message?.includes('tfjs-node') || e.code === 'ERR_MODULE_NOT_FOUND') {
        return res.status(503).json({ error: 'server_recognition_unavailable' })
      }
      throw e
    }
    const workers = await workersPromise

    if (!descriptor) {
      return res.json({ ok: false, reason: 'no_face', tookMs: Date.now() - t0 })
    }

    const { bestMatch } = await import('./face/recognition.js')
    const match = bestMatch(workers, descriptor, 0.60)
    void match // for readability below
    if (!match) {
      return res.json({ ok: false, reason: 'unknown', tookMs: Date.now() - t0 })
    }

    // 2. Punch flow — identical to POST /api/punches but already have the worker.
    const ts = Date.now()
    const db = readDB()
    const worker = db.workers.find(w => w.id === match.worker.id) || match.worker

    const prevState = worker.currentState || 'out'
    const direction = (requestedDirection === 'in' || requestedDirection === 'out')
      ? requestedDirection
      : (prevState === 'in' ? 'out' : 'in')

    const cd = cooldownReason(worker, ts, direction)
    if (cd) {
      return res.status(429).json({
        error: 'cooldown',
        reason: cd.kind,
        lastPunchTs: worker.lastPunchTs,
        lastDirection: worker.currentState,
        retryAfterMs: cd.retryAfterMs,
        worker: { id: worker.id, name: worker.name }
      })
    }

    const hoursWorked = (direction === 'out' && prevState === 'in' && worker.lastPunchTs)
      ? (ts - worker.lastPunchTs) / 3_600_000
      : null

    // Save the punch photo locally.
    const dayFolder = path.join(PUNCHES_DIR, dateFolder(ts))
    fs.mkdirSync(dayFolder, { recursive: true })
    const filename = `${ts}_${safe(worker.id)}.jpg`
    const rel = `data/punches/${dateFolder(ts)}/${filename}`
    fs.writeFileSync(path.join(dayFolder, filename), buf)

    const punch = {
      id: uid(),
      workerId: worker.id,
      employeeId: worker.employeeId || null,
      kind: worker.kind || 'worker',
      name: worker.name || 'Unknown',
      direction,
      ts,
      localTime: localTime || null,
      photo: rel,
      photoAbs: path.join(dayFolder, filename),
      distance: match.distance,
      hoursWorked,
      sizeBytes: buf.length
    }

    // Update local cache.
    const localWorker = db.workers.find(w => w.id === worker.id)
    if (localWorker) {
      localWorker.currentState = direction
      localWorker.lastPunchTs = ts
    }
    db.punches.push(punch)
    writeDB(db)

    // Background syncs.
    updateWorkerState(worker.id, direction, ts).catch(e =>
      console.warn('[store] updateWorkerState bg failed:', e.message))
    try { enqueuePunch(punch) } catch (e) { console.warn('[sync] enqueue failed:', e.message) }

    return res.json({
      ok: true,
      worker: { id: worker.id, name: worker.name, employeeId: worker.employeeId, thumb: worker.thumb || '' },
      direction,
      hoursWorked,
      minShiftMs: MIN_SHIFT_MS,
      distance: match.distance,
      tookMs: Date.now() - t0
    })
  } catch (e) {
    console.error('[recognize-and-punch]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

// Warmup endpoint — call this from a cron to keep models in memory.
app.get('/api/face/warm', async (_req, res) => {
  try { await loadModels(); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// --- Static: serve saved images so the frontend can display them ----------

app.use('/data', express.static(DATA_DIR))

// --- Stats ----------------------------------------------------------------

app.get('/api/stats', async (_req, res) => {
  try {
    // Source of truth = the Google Sheet (Workers tab + Sheet1). Falls back to
    // local db.json if sync isn't configured.
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

    if (syncEnabled()) {
      const workers = await storeListWorkers()
      const clockedIn = workers.filter(w => w.currentState === 'in').length

      // Pull punch log from Sheet1 (header row + data rows).
      let punchRows = []
      try {
        const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
        const rows = await readSheet(tab)
        punchRows = rows.slice(1).filter(r => r && r[0])  // skip header, require timestamp
      } catch (e) {
        console.warn('[api/stats] could not read punch sheet:', e.message)
      }

      const todayPunches = punchRows.filter(r => {
        const ts = Date.parse(r[0])
        return Number.isFinite(ts) && ts >= startOfDay.getTime()
      }).length

      const last = punchRows[punchRows.length - 1] || null
      return res.json({
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
    }

    // Local-only fallback.
    const db = readDB()
    const today = db.punches.filter(p => p.ts >= startOfDay.getTime())
    const workers = db.workers.filter(w => !w.deactivated)
    const clockedIn = workers.filter(w => w.currentState === 'in').length
    const last = db.punches[db.punches.length - 1] || null
    res.json({
      workers: workers.length,
      punches: db.punches.length,
      todayPunches: today.length,
      clockedIn,
      lastPunch: last ? { name: last.name, ts: last.ts, direction: last.direction || 'in' } : null
    })
  } catch (e) {
    console.error('[api/stats]', e)
    res.status(500).json({ error: 'stats_unavailable' })
  }
})

// --- Sync status (for debugging) ------------------------------------------
app.get('/api/sync/status', (_req, res) => res.json(outboxStatus()))

// --- Serve the built frontend in production -------------------------------
// In dev, Vite serves the SPA on a separate port. On Azure (production), this
// process serves both the API and the built static files from dist/.
if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === '1') {
  const DIST = path.join(ROOT, 'dist')
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST))
    // SPA fallback — any non-API GET serves index.html.
    app.get(/^\/(?!api\/|data\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
    console.log(`[attendance] serving frontend from ${DIST}`)
  } else {
    console.warn('[attendance] NODE_ENV=production but dist/ not found — run `npm run build` first')
  }
}

const PORT = process.env.PORT || 5174
app.listen(PORT, async () => {
  console.log(`[attendance] api+data on http://localhost:${PORT}`)
  console.log(`[attendance] data dir: ${DATA_DIR}`)
  initOutbox({ dataDir: DATA_DIR })
  await initWorkerStore({ dataDir: DATA_DIR })
  // Pre-warm the face-recognition models so the first punch isn't slow.
  // Silently skip when tfjs-node isn't installed (local macOS dev).
  loadModels()
    .then(() => console.log('[face/server] ready'))
    .catch(e => console.log('[face/server] disabled —', e.message.split('\n')[0]))
})
