// Thin client for the local Express backend.
const BASE = ''

async function j(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`)
  return res.json()
}

export const api = {
  listWorkers: () => j('GET', '/api/workers'),
  createWorker: (name, photos, descriptor) => j('POST', '/api/workers', { name, photos, descriptor }),
  listPunches: (limit = 200) => j('GET', `/api/punches?limit=${limit}`),
  createPunch: (workerId, name, photo) => j('POST', '/api/punches', { workerId, name, photo }),
  stats: () => j('GET', '/api/stats')
}
