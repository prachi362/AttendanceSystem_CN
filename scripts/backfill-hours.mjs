// Back-fill Hours Worked (column I) and Kind (column H) for every existing
// row in the punch log tab. Walks chronologically and pairs each OUT punch
// with the most recent prior IN by the same Worker ID.
//
// Run:  node scripts/backfill-hours.mjs

import 'dotenv/config'
import fs from 'node:fs'
import { JWT } from 'google-auth-library'
import { readSheet } from '../server/sync/google.js'

const TAB = process.env.GOOGLE_SHEET_TAB || 'Sheet1'

function loadKey() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim()
    if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(raw)
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'))
  }
  throw new Error('No Google credentials in env.')
}

const sheetId = process.env.GOOGLE_SHEET_ID
const key = loadKey()
const jwt = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

async function batchUpdate(updates) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`
  const r = await jwt.request({
    url, method: 'POST',
    data: { valueInputOption: 'USER_ENTERED', data: updates }
  })
  return r.data
}

// Build a workerId → kind map from the Workers + Employees registry tabs.
async function loadKindMap() {
  const map = new Map()
  for (const [tab, kind] of [['Workers', 'Worker'], ['Employees', 'Employee']]) {
    try {
      const rows = await readSheet(tab)
      for (const r of rows.slice(1)) {
        if (r && r[0]) map.set(r[0], kind)
      }
    } catch (e) {
      console.warn(`[backfill] ${tab} read failed:`, e.message)
    }
  }
  return map
}

function parseTs(s) {
  if (!s) return NaN
  // Local strings like "2026-05-13 21:20:00" — convert to ISO by replacing space.
  const iso = String(s).includes('T') ? s : String(s).replace(' ', 'T')
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : NaN
}

async function main() {
  const kindMap = await loadKindMap()
  console.log(`[backfill] registry: ${kindMap.size} workers indexed`)

  const rows = await readSheet(TAB)
  if (rows.length <= 1) { console.log('Sheet1 is empty.'); return }

  // Column layout (1-indexed):  A ts | B name | C empId | D dir | E photo | F workerId | G distance | H kind | I hours
  const updates = []
  const lastInByWorker = new Map()

  let inCount = 0, outPaired = 0, outOrphan = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const sheetRow = i + 1 // 1-indexed
    const ts = parseTs(r[0])
    const dir = String(r[3] || '').trim().toUpperCase()
    const workerId = r[5] || ''
    const kind = kindMap.get(workerId) || ''

    // Always write the Kind cell (H) when we know it.
    if (kind) {
      updates.push({ range: `${TAB}!H${sheetRow}`, values: [[kind]] })
    }

    if (dir === 'IN') {
      inCount++
      if (workerId && Number.isFinite(ts)) {
        lastInByWorker.set(workerId, ts)
      }
    } else if (dir === 'OUT') {
      const inTs = workerId ? lastInByWorker.get(workerId) : null
      if (inTs && Number.isFinite(ts)) {
        const hours = (ts - inTs) / 3_600_000
        updates.push({ range: `${TAB}!I${sheetRow}`, values: [[hours.toFixed(2)]] })
        outPaired++
        lastInByWorker.delete(workerId)
      } else {
        outOrphan++
      }
    }
  }

  console.log(`[backfill] rows scanned: ${rows.length - 1}  IN=${inCount}  OUT paired=${outPaired}  OUT without IN=${outOrphan}`)
  console.log(`[backfill] updates: ${updates.length}`)

  // Sheets caps batchUpdate at ~10k ranges; chunk to be safe.
  const CHUNK = 500
  for (let i = 0; i < updates.length; i += CHUNK) {
    await batchUpdate(updates.slice(i, i + CHUNK))
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
