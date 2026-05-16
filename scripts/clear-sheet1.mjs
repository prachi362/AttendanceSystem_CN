#!/usr/bin/env node
// Wipes every data row from the punch-log tab (default: Sheet1) while keeping
// the header row intact. Also resets currentState on every registered worker
// back to 'out' so nobody is stuck "in" after a clean slate.
//
// Reads credentials from .env exactly like the server does.

import 'dotenv/config'
import { readSheet } from '../server/sync/google.js'
import { updateWorkerState } from '../server/store/workers.js'
import { JWT } from 'google-auth-library'
import fs from 'node:fs'

let key
if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim()
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8')
  key = JSON.parse(raw)
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  key = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'))
} else {
  console.error('No GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_JSON set.')
  process.exit(1)
}

const jwt = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

const tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1'
const rows = await readSheet(tab)

if (rows.length > 1) {
  const range = `${tab}!A2:Z${rows.length}`
  await jwt.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    method: 'POST'
  })
  console.log(`Cleared ${rows.length - 1} punch row(s) from ${tab}.`)
} else {
  console.log(`${tab} is already empty.`)
}

// Reset every registered worker back to 'out'.
for (const sheet of ['Workers', 'Employees']) {
  let n = 0
  try {
    const rs = await readSheet(sheet)
    for (let i = 1; i < rs.length; i++) {
      const id = rs[i]?.[0]
      if (id) { await updateWorkerState(id, 'out', ''); n++ }
    }
    console.log(`${sheet}: reset ${n} worker(s) to 'out'.`)
  } catch (e) {
    console.warn(`${sheet}: skipped (${e.message})`)
  }
}

console.log('Done. The dashboard will refresh within ~30s (or hard-refresh the browser).')
