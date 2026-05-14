// GET /api/workers   — list all workers (with descriptors) from the Sheets store
// POST /api/workers  — create a new worker
//
// Stateless: photos are NOT saved on Vercel (ephemeral FS). Only descriptors
// + metadata go to the Sheets `Workers` tab. Photos can be added later by
// wiring a real object store (R2 / Drive Shared Drive / Supabase).

import { ensureInit, uid, setHeaders } from './_init.js'
import { listWorkers, createWorker } from '../server/store/workers.js'

export default async function handler(req, res) {
  setHeaders(res)
  try {
    await ensureInit()

    if (req.method === 'GET') {
      const workers = await listWorkers()
      // Strip local photo paths — they exist only on the kiosk that registered
      // the worker. On Vercel there is no /data/* static handler, so returning
      // them would cause 404s when the UI tries <img src=...>.
      return res.status(200).json(workers.map(w => ({
        id: w.id, name: w.name, employeeId: w.employeeId || null,
        createdAt: w.createdAt,
        folder: '',
        thumb: '',
        descriptor: w.descriptor || null,
        descriptors: w.descriptors || null,
        currentState: w.currentState || 'out',
        lastPunchTs: w.lastPunchTs || null
      })))
    }

    if (req.method === 'POST') {
      const { name, employeeId, descriptor, descriptors } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name is required' })

      const id = uid()
      const worker = {
        id,
        name: String(name).trim(),
        employeeId: employeeId ? String(employeeId).trim() : null,
        createdAt: Date.now(),
        folder: '',  // no local folder on Vercel
        thumb: '',
        descriptor: Array.isArray(descriptor) ? descriptor : null,
        descriptors: Array.isArray(descriptors) ? descriptors.filter(d => Array.isArray(d) && d.length) : null,
        currentState: 'out',
        lastPunchTs: null
      }
      await createWorker(worker)
      return res.status(200).json({
        ok: true,
        worker: { id: worker.id, name: worker.name, employeeId: worker.employeeId, folder: '', thumb: '' }
      })
    }

    res.status(405).json({ error: 'method_not_allowed' })
  } catch (e) {
    console.error('[api/workers]', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
}
