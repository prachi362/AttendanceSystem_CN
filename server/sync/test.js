// One-shot debug: try to write a row and upload a 1-byte file. Prints full errors.
import 'dotenv/config'
import { appendRow, uploadPhoto, syncEnabled, photoUploadEnabled } from './google.js'

console.log('SYNC_ENABLED:', syncEnabled())
console.log('SHEET_ID    :', process.env.GOOGLE_SHEET_ID)
console.log('SHEET_TAB   :', process.env.GOOGLE_SHEET_TAB || '(default Sheet1)')
console.log('FOLDER_ID   :', process.env.GOOGLE_DRIVE_FOLDER_ID)
console.log('KEY FILE    :', process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
console.log()

try {
  console.log('1) Appending a test row to the sheet…')
  const r1 = await appendRow([
    new Date().toISOString(), 'TEST', 'EMP-TEST', 'IN', '', 'test-id', 0
  ])
  console.log('   ✓ row appended:', r1.updates?.updatedRange)
} catch (e) {
  console.error('   ✗ sheet append FAILED:')
  console.error('     status:', e.response?.status)
  console.error('     body  :', JSON.stringify(e.response?.data || e.message, null, 2))
}

if (!photoUploadEnabled()) {
  console.log('\n2) Drive upload: SKIPPED (no GOOGLE_DRIVE_FOLDER_ID set — sheet-only mode).')
} else {
  try {
    console.log('\n2) Uploading a test photo to Drive…')
    const r2 = await uploadPhoto({ filename: `test-${Date.now()}.txt`, buffer: Buffer.from('hello'), mime: 'text/plain' })
    console.log('   ✓ uploaded:', r2)
  } catch (e) {
    console.error('   ✗ drive upload FAILED:')
    console.error('     status:', e.response?.status)
    console.error('     body  :', JSON.stringify(e.response?.data || e.message, null, 2))
  }
}
