// Shared init for Vercel serverless functions.
// Vercel boots a fresh process per cold-start; this runs once per cold-start.
import { initWorkerStore } from '../server/store/workers.js'

let initPromise = null
export function ensureInit() {
  if (!initPromise) {
    initPromise = initWorkerStore({ stateless: true }).catch(e => {
      console.error('[init] failed:', e)
      initPromise = null  // allow retry on next request
      throw e
    })
  }
  return initPromise
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// Set permissive JSON / CORS headers. Vercel functions need this if you ever
// call them cross-origin; same-origin calls (the kiosk frontend on the same
// vercel.app domain) don't strictly need it but it doesn't hurt.
export function setHeaders(res) {
  res.setHeader('Content-Type', 'application/json')
}
