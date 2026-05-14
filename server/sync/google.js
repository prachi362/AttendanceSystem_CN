// Google client for Sheets + Drive (service-account auth).
//
// Required env:
//   GOOGLE_SERVICE_ACCOUNT_JSON   absolute path to the downloaded service-account key file
//   GOOGLE_SHEET_ID                e.g. 1blaeIiEpzSkQppM88j6VjiqTyNgrwvpEgEg8tw54F90
//   GOOGLE_SHEET_TAB               sheet/tab name (default "Sheet1")
//   GOOGLE_DRIVE_FOLDER_ID         folder ID in Drive that will hold the photos
//
// The service account email (in the JSON) must have Editor access to BOTH the
// sheet and the drive folder.

import fs from 'node:fs'
import { JWT } from 'google-auth-library'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
]

function loadKey() {
  // Production: inline JSON in env var (preferred for hosted deploys)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim()
    // Allow base64 to avoid newline escaping headaches in some hosts
    if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(raw)
  }
  // Local dev: file path on disk
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'))
  }
  throw new Error('Set GOOGLE_SERVICE_ACCOUNT_JSON (path) or GOOGLE_SERVICE_ACCOUNT_KEY (inline)')
}

let jwt = null
function client() {
  if (jwt) return jwt
  const key = loadKey()
  jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES
  })
  return jwt
}

export function syncEnabled() {
  if (process.env.SYNC_DISABLED) return false
  const haveKey = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  return haveKey && !!process.env.GOOGLE_SHEET_ID
}

// Photo upload to Drive is opt-in (requires a Shared Drive folder).
export function photoUploadEnabled() {
  return !!process.env.GOOGLE_DRIVE_FOLDER_ID
}

// --- Sheets ----------------------------------------------------------------

function sheetId() { return process.env.GOOGLE_SHEET_ID }

// Append one row to a tab. `values` is a flat array of cell values.
export async function appendRow(values, tab = process.env.GOOGLE_SHEET_TAB || 'Sheet1') {
  const range = encodeURIComponent(`${tab}!A1`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const r = await client().request({ url, method: 'POST', data: { values: [values] } })
  return r.data
}

// Read all rows from a tab. Returns array of row arrays (header row included).
export async function readSheet(tab) {
  const range = encodeURIComponent(`${tab}!A1:Z`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}`
  const r = await client().request({ url, method: 'GET' })
  return r.data.values || []
}

// Update a specific range. `range` like "Workers!E5:F5", values is a flat row.
export async function updateRange(range, values) {
  const encoded = encodeURIComponent(range)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encoded}?valueInputOption=USER_ENTERED`
  const r = await client().request({ url, method: 'PUT', data: { values: [values] } })
  return r.data
}

// Ensure a tab exists with the given header row. Idempotent — safe to call on boot.
export async function ensureTab(tab, headers) {
  // 1. Check if tab exists by trying to read it.
  try {
    const rows = await readSheet(tab)
    if (rows.length === 0) {
      // Tab exists but empty — write the header row.
      await updateRange(`${tab}!A1`, headers)
    }
    return
  } catch (e) {
    // 400 "Unable to parse range" means the tab doesn't exist — create it.
    if (e?.response?.status !== 400) throw e
  }

  // 2. Create the tab via batchUpdate.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}:batchUpdate`
  await client().request({
    url, method: 'POST',
    data: { requests: [{ addSheet: { properties: { title: tab } } }] }
  })
  // 3. Write header row.
  await updateRange(`${tab}!A1`, headers)
}

// --- Drive -----------------------------------------------------------------

// Upload a photo (Buffer) to the configured Drive folder. Returns { id, webViewLink }.
export async function uploadPhoto({ filename, buffer, mime = 'image/jpeg' }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // Multipart upload: metadata + binary in one request.
  const boundary = '----kiosk_' + Math.random().toString(36).slice(2)
  const metadata = { name: filename, parents: [folderId] }

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mime}\r\n\r\n`,
    'utf8'
  )
  const tail = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([head, buffer, tail])

  const r = await client().request({
    url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink',
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  })
  return r.data
}
