// Thin client for the local Express backend.
const BASE = ''

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
  createPunch: (workerId, name, photo, distance) => j('POST', '/api/punches', { workerId, name, photo, distance }),
  stats: () => j('GET', '/api/stats')
}
