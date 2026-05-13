// Local outbox that drains pending punches to Google Sheets + Drive.
// Survives restarts (persisted to disk) and offline periods.

import fs from 'node:fs'
import path from 'node:path'
import { uploadPhoto, appendRow, syncEnabled, photoUploadEnabled } from './google.js'

const BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000, 30 * 60_000]
const TICK_MS = 5_000

let OUTBOX_FILE = null
let queue = []
let timer = null
let running = false

function load() {
  try { queue = JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf8')) }
  catch { queue = [] }
}
function save() {
  fs.writeFileSync(OUTBOX_FILE, JSON.stringify(queue, null, 2))
}

export function initOutbox({ dataDir }) {
  OUTBOX_FILE = path.join(dataDir, 'outbox.json')
  load()
  if (syncEnabled()) {
    schedule(1000)
    console.log(`[sync] outbox loaded (${queue.length} pending) — Google sync enabled`)
  } else {
    console.log('[sync] disabled — GOOGLE_* env vars not set')
  }
}

export function enqueuePunch(punch) {
  if (!syncEnabled()) return
  queue.push({
    id: punch.id,
    kind: 'punch',
    payload: punch,
    attempts: 0,
    nextAt: Date.now()
  })
  save()
  schedule(200)
}

export function outboxStatus() {
  return {
    enabled: syncEnabled(),
    pending: queue.length,
    nextItem: queue[0] ? { id: queue[0].id, attempts: queue[0].attempts, nextAt: queue[0].nextAt } : null
  }
}

function schedule(delay = TICK_MS) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(drain, delay)
}

async function drain() {
  if (running) { schedule(); return }
  running = true
  try {
    const now = Date.now()
    const item = queue.find(i => i.nextAt <= now)
    if (!item) { schedule(); return }

    try {
      await processItem(item)
      queue = queue.filter(i => i.id !== item.id)
      save()
      schedule(100)
    } catch (e) {
      item.attempts += 1
      const backoff = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]
      item.nextAt = Date.now() + backoff
      console.warn(`[sync] item ${item.id} failed (attempt ${item.attempts}); retry in ${Math.round(backoff/1000)}s — ${e.message}`)
      save()
      schedule(backoff)
    }
  } finally {
    running = false
  }
}

async function processItem(item) {
  const p = item.payload
  // 1. Upload photo to Drive — only if a folder is configured (requires Shared Drive).
  let photoUrl = ''
  if (photoUploadEnabled() && p.photoAbs && fs.existsSync(p.photoAbs)) {
    const buf = fs.readFileSync(p.photoAbs)
    const stamp = new Date(p.ts)
    const day = `${stamp.getFullYear()}-${pad(stamp.getMonth()+1)}-${pad(stamp.getDate())}`
    const filename = `${day}_${p.ts}_${safe(p.name || p.workerId || 'punch')}.jpg`
    const uploaded = await uploadPhoto({ filename, buffer: buf })
    photoUrl = uploaded.webViewLink || ''
  }

  // 2. Append a row to the sheet.
  //   Columns: Timestamp | Name | Employee ID | Direction | Photo | Worker ID | Match Distance
  const row = [
    new Date(p.ts).toISOString(),
    p.name || '',
    p.employeeId || '',
    (p.direction || '').toUpperCase(),
    photoUrl ? `=HYPERLINK("${photoUrl}","photo")` : '',
    p.workerId || '',
    typeof p.distance === 'number' ? Number(p.distance.toFixed(4)) : ''
  ]
  await appendRow(row)
}

function pad(n) { return String(n).padStart(2, '0') }
function safe(s) { return String(s).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) }
