// Thin client for the local Express backend.
const BASE = ''

// "2026-05-13 18:30:15" in the user's local timezone — sortable, readable,
// matches what the kiosk shows on screen (no UTC drift).
function formatLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function j(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `${method} ${url} -> ${res.status}`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

export const api = {
  listWorkers: () => j('GET', '/api/workers'),
  createWorker: (payload) => j('POST', '/api/workers', payload),
  listPunches: (limit = 200) => j('GET', `/api/punches?limit=${limit}`),
  createPunch: (workerId, name, photo, distance, direction) =>
    j('POST', '/api/punches', { workerId, name, photo, distance, direction }),
  stats: () => j('GET', '/api/stats')
}
