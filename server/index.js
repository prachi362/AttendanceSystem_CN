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

app.get('/api/workers', (_req, res) => {
  const db = readDB()
  res.json(db.workers.filter(w => !w.deactivated).map(w => ({
    id: w.id, name: w.name, employeeId: w.employeeId || null,
    createdAt: w.createdAt, folder: w.folder, thumb: w.thumb,
    descriptor: w.descriptor || null,
    descriptors: w.descriptors || null,
    currentState: w.currentState || 'out',
    lastPunchTs: w.lastPunchTs || null
  })))
})

app.post('/api/workers', (req, res) => {
  const { name, employeeId, photos, descriptor, descriptors } = req.body || {}
  if (!name || !photos || !photos.front) {
    return res.status(400).json({ error: 'name and photos.front are required' })
  }
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

  const worker = {
    id,
    name: String(name).trim(),
    employeeId: employeeId ? String(employeeId).trim() : null,
    createdAt: Date.now(),
    folder: `data/workers/${folderName}`,
    thumb: saved.front || null,
    photos: saved,
    descriptor: Array.isArray(descriptor) ? descriptor : null,
    descriptors: Array.isArray(descriptors) ? descriptors.filter(d => Array.isArray(d) && d.length) : null,
    currentState: 'out',
    lastPunchTs: null,
    deactivated: false
  }
  const db = readDB()
  db.workers.push(worker)
  writeDB(db)
  res.json({ ok: true, worker: { id: worker.id, name: worker.name, employeeId: worker.employeeId, folder: worker.folder, thumb: worker.thumb } })
})

// --- Punches ---------------------------------------------------------------

app.get('/api/punches', (req, res) => {
  const db = readDB()
  const { limit = 200 } = req.query
  const list = db.punches.slice(-Number(limit)).reverse()
  res.json(list)
})

// Cooldown so we don't double-record someone within 60s.
const PUNCH_COOLDOWN_MS = 60 * 1000

app.post('/api/punches', (req, res) => {
  const { workerId, name, photo, distance } = req.body || {}
  const buf = dataUrlToBuffer(photo)
  if (!buf) return res.status(400).json({ error: 'photo (data URL) required' })

  const ts = Date.now()
  const db = readDB()
  const worker = db.workers.find(w => w.id === workerId)

  // Debounce: if same worker punched within cooldown, refuse.
  if (worker && worker.lastPunchTs && (ts - worker.lastPunchTs) < PUNCH_COOLDOWN_MS) {
    return res.status(429).json({
      error: 'cooldown',
      lastPunchTs: worker.lastPunchTs,
      lastDirection: worker.currentState || 'in',
      retryAfterMs: PUNCH_COOLDOWN_MS - (ts - worker.lastPunchTs)
    })
  }

  const dayFolder = path.join(PUNCHES_DIR, dateFolder(ts))
  fs.mkdirSync(dayFolder, { recursive: true })
  const filename = `${ts}_${safe(workerId || 'unknown')}.jpg`
  const rel = `data/punches/${dateFolder(ts)}/${filename}`
  fs.writeFileSync(path.join(dayFolder, filename), buf)

  // Toggle direction off the worker's current state.
  const prevState = worker?.currentState || 'out'
  const direction = prevState === 'in' ? 'out' : 'in'

  const punch = {
    id: uid(),
    workerId: workerId || null,
    employeeId: worker?.employeeId || null,
    name: name || 'Unknown',
    direction,
    ts,
    photo: rel,
    photoAbs: path.join(dayFolder, filename),  // for the sync worker
    distance: typeof distance === 'number' ? distance : null,
    sizeBytes: buf.length
  }
  db.punches.push(punch)
  if (worker) {
    worker.currentState = direction
    worker.lastPunchTs = ts
  }
  writeDB(db)

  // Best-effort: push to Microsoft Graph in the background. Never blocks the response.
  try { enqueuePunch(punch) } catch (e) { console.warn('[sync] enqueue failed:', e.message) }

  res.json({ ok: true, punch })
})

// --- Static: serve saved images so the frontend can display them ----------

app.use('/data', express.static(DATA_DIR))

// --- Stats ----------------------------------------------------------------

app.get('/api/stats', (_req, res) => {
  const db = readDB()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
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
})

// --- Sync status (for debugging) ------------------------------------------
app.get('/api/sync/status', (_req, res) => res.json(outboxStatus()))

const PORT = process.env.PORT || 5174
app.listen(PORT, () => {
  console.log(`[attendance] api+data on http://localhost:${PORT}`)
  console.log(`[attendance] data dir: ${DATA_DIR}`)
  initOutbox({ dataDir: DATA_DIR })
})
