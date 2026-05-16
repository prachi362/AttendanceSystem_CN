// One-off: wipe every registered person from the Workers + Employees tabs.
// Keeps the header row in each tab and leaves Sheet1 (punch history) alone.
//
// Run:  node scripts/clear-registrations.mjs

import 'dotenv/config'
import fs from 'node:fs'
import { JWT } from 'google-auth-library'
import { readSheet } from '../server/sync/google.js'

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

async function clearRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:clear`
  await jwt.request({ url, method: 'POST' })
}

async function clearTab(tab) {
  const rows = await readSheet(tab)
  if (rows.length <= 1) {
    console.log(`${tab}: already empty.`)
    return 0
  }
  await clearRange(`${tab}!A2:Z${rows.length}`)
  console.log(`${tab}: cleared ${rows.length - 1} row(s).`)
  return rows.length - 1
}

async function main() {
  const a = await clearTab('Workers')
  const b = await clearTab('Employees')
  console.log(`Done. ${a + b} registration(s) removed. Sheet1 punch log untouched.`)
  console.log('Server cache will refresh within ~30s; new registrations will start fresh.')
}

main().catch(e => { console.error(e); process.exit(1) })
