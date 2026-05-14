// Workers store. Source of truth = a "Workers" tab in the configured Google Sheet
// (when sync is enabled). Falls back to local data/db.json otherwise.
//
// Columns in the Workers tab:
//   A id | B name | C employeeId | D createdAt | E currentState | F lastPunchTs |
//   G folder | H thumb | I descriptors (JSON of number[][])
//
// In-memory cache with a short TTL keeps recognition fast — the punch flow
// hits this on every attempt, but we don't want to hammer the Sheets API.

import fs from 'node:fs'
import path from 'node:path'
import { syncEnabled, readSheet, appendRow, updateRange, ensureTab } from '../sync/google.js'

const TAB = 'Workers'
const HEADERS = ['id','name','employeeId','createdAt','currentState','lastPunchTs','folder','thumb','descriptors']
const CACHE_TTL_MS = 30_000

let DB_FILE = null
let stateless = false  // when true, never touch the filesystem (e.g. Vercel)
let cache = { rows: [], at: 0 }

export async function initWorkerStore({ dataDir, stateless: isStateless = false } = {}) {
  stateless = isStateless || !dataDir
  if (!stateless) DB_FILE = path.join(dataDir, 'db.json')
  if (syncEnabled()) {
    try {
      await ensureTab(TAB, HEADERS)
      console.log(`[store] Workers tab ready in Google Sheet${stateless ? ' (stateless mode)' : ''}`)
    } catch (e) {
      console.warn('[store] ensureTab failed:', e.message)
    }
  }
}

// Read local db.json (used when sync disabled OR as last-ditch fallback). No-op when stateless.
function readLocal() {
  if (stateless || !DB_FILE) return { workers: [], punches: [] }
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }
  catch { return { workers: [], punches: [] } }
}
function writeLocal(db) {
  if (stateless || !DB_FILE) return
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)) }
  catch (e) { console.warn('[store] writeLocal failed:', e.message) }
}

function rowToWorker(row) {
  // row is array; some cells may be undefined if blank trailing cells.
  const [id, name, employeeId, createdAt, currentState, lastPunchTs, folder, thumb, descriptorsJson] = row
  let descriptors = null
  try { if (descriptorsJson) descriptors = JSON.parse(descriptorsJson) } catch {}
  return {
    id: id || '',
    name: name || '',
    employeeId: employeeId || null,
    createdAt: createdAt ? Number(createdAt) : null,
    currentState: currentState || 'out',
    lastPunchTs: lastPunchTs ? Number(lastPunchTs) : null,
    folder: folder || null,
    thumb: thumb || null,
    descriptor: Array.isArray(descriptors) && descriptors[0] ? descriptors[0] : null,
    descriptors: Array.isArray(descriptors) ? descriptors : null,
    deactivated: false
  }
}

function workerToRow(w) {
  return [
    w.id, w.name, w.employeeId || '', w.createdAt || '',
    w.currentState || 'out', w.lastPunchTs || '',
    w.folder || '', w.thumb || '',
    JSON.stringify(w.descriptors || (w.descriptor ? [w.descriptor] : []))
  ]
}

export async function listWorkers({ force = false } = {}) {
  if (!syncEnabled()) {
    return readLocal().workers.filter(w => !w.deactivated)
  }
  if (!force && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows
  try {
    const rows = await readSheet(TAB)
    // Skip header row (rows[0]). Filter rows that have at least an id.
    const parsed = rows.slice(1).filter(r => r && r[0]).map(rowToWorker)
    cache = { rows: parsed, at: Date.now() }
    return parsed
  } catch (e) {
    console.warn('[store] listWorkers from Sheets failed, using local cache:', e.message)
    // If sheet read fails (e.g. transient network), serve stale cache if any.
    if (cache.rows.length) return cache.rows
    return readLocal().workers.filter(w => !w.deactivated)
  }
}

export async function createWorker(w) {
  // Always write a local copy so kiosk works offline too.
  const local = readLocal()
  local.workers.push(w)
  writeLocal(local)

  if (!syncEnabled()) return

  try {
    await appendRow(workerToRow(w), TAB)
    cache.at = 0 // invalidate
  } catch (e) {
    console.warn('[store] createWorker → Sheets failed (kept locally):', e.message)
  }
}

// Update currentState + lastPunchTs on a worker by id. We have to find the row
// number first; this means one extra read, but punches are infrequent.
export async function updateWorkerState(id, currentState, lastPunchTs) {
  // local mirror
  const local = readLocal()
  const w = local.workers.find(x => x.id === id)
  if (w) {
    w.currentState = currentState
    w.lastPunchTs = lastPunchTs
    writeLocal(local)
  }

  if (!syncEnabled()) return

  try {
    const rows = await readSheet(TAB)
    // header at index 0; data starts at row 2 in sheet coords
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id)
    if (idx === -1) {
      console.warn(`[store] updateWorkerState: worker ${id} not found in Sheets`)
      return
    }
    const sheetRow = idx + 1 // 1-indexed
    await updateRange(`${TAB}!E${sheetRow}:F${sheetRow}`, [currentState, lastPunchTs])
    cache.at = 0
  } catch (e) {
    console.warn('[store] updateWorkerState failed:', e.message)
  }
}

export function invalidateCache() { cache.at = 0 }
