// One-off migration: every person currently in the "Workers" tab is actually
// an Employee. Move all rows to the "Employees" tab and clear the Workers tab.
//
// Run:  node scripts/migrate-workers-to-employees.mjs
//       (needs the same .env credentials used by the server.)

import 'dotenv/config'
import { readSheet, appendRow, ensureTab } from '../server/sync/google.js'

const FROM_TAB = 'Workers'
const TO_TAB   = 'Employees'
const HEADERS  = ['id','name','employeeId','createdAt','currentState','lastPunchTs','folder','thumb','descriptors','kind']

const sheetId = process.env.GOOGLE_SHEET_ID
if (!sheetId) {
  console.error('GOOGLE_SHEET_ID not set. Did you load .env?')
  process.exit(1)
}

// Helper: call the Sheets API via the same JWT used elsewhere.
import { JWT } from 'google-auth-library'
import fs from 'node:fs'
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
const key = loadKey()
const jwt = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

async function clearRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:clear`
  const r = await jwt.request({ url, method: 'POST' })
  return r.data
}

async function main() {
  await ensureTab(TO_TAB, HEADERS)

  const rows = await readSheet(FROM_TAB)
  if (rows.length <= 1) {
    console.log(`Workers tab is empty (only header). Nothing to migrate.`)
    return
  }

  const dataRows = rows.slice(1).filter(r => r && r[0])
  console.log(`Found ${dataRows.length} person(s) to move to Employees…`)

  for (const row of dataRows) {
    // Pad to 10 columns and force the kind column (J) to 'employee'.
    const padded = [...row]
    while (padded.length < 10) padded.push('')
    padded[9] = 'employee'
    await appendRow(padded, TO_TAB)
    console.log(`  → moved ${padded[1] || padded[0]}`)
  }

  // Clear all data rows in Workers (rows 2..end). Keep the header at row 1.
  const lastRow = rows.length
  await clearRange(`${FROM_TAB}!A2:Z${lastRow}`)
  console.log(`Cleared ${FROM_TAB} rows 2..${lastRow}`)

  console.log('Done. Restart the server (or wait 30s for the cache to expire) and the kiosk will see them as Employees.')
}

main().catch(err => { console.error(err); process.exit(1) })
