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

// 1. Look up the numeric sheetId for `tab` (needed by batchUpdate).
const meta = await jwt.request({
  url: `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties))`,
  method: 'GET'
})
const sheet = meta.data.sheets.find(s => s.properties.title === tab)
if (!sheet) throw new Error(`Tab ${tab} not found`)
const sheetId = sheet.properties.sheetId
const rowCount = sheet.properties.gridProperties.rowCount

// 2. DELETE all data rows (rows 2..end) instead of just clearing values.
//    `clear` leaves empty rows behind, which Google Sheets' INSERT_ROWS append
//    treats as the end of the table — so new rows land below them. Actually
//    removing the rows ensures new appends start at row 2.
if (rowCount > 1) {
  await jwt.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}:batchUpdate`,
    method: 'POST',
    data: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: 1,        // 0-based, so this skips the header row
            endIndex: rowCount    // delete through the last existing row
          }
        }
      }]
    }
  })
  console.log(`Deleted ${rowCount - 1} row(s) from ${tab} (header kept).`)
} else {
  console.log(`${tab} only has a header row — nothing to delete.`)
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
