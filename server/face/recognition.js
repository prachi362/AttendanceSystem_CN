// Server-side face recognition.
// Runs on both the local Express server AND Vercel serverless functions.
//
// We bundle CPU tfjs via @vladmandic/face-api itself (no extra deps).
// Models are loaded from the vladmandic CDN on cold start (~1-2s).
// First inference compiles graphs (~1-2s), subsequent calls are ~300-800ms.
// Server-side face recognition. Requires @tensorflow/tfjs-node which has
// native libtensorflow bindings. Available on Linux x64 (Azure App Service)
// but often fails to build on macOS arm64. When unavailable, the recognize
// endpoint returns 503 and the browser falls back to its own (slower) path.
import sharp from 'sharp'

let faceapi = null
let tfNodeAvailable = false

async function importFaceApi() {
  if (faceapi) return faceapi
  await import('@tensorflow/tfjs-node')  // registers the native backend
  tfNodeAvailable = true
  faceapi = await import('@vladmandic/face-api')
  return faceapi
}

export function isAvailable() { return tfNodeAvailable }

const MODEL_URL = process.env.FACE_MODEL_URL || 'https://vladmandic.github.io/face-api/model'

// Promise cache — models are loaded exactly once per process lifetime.
let modelsPromise = null

export function loadModels() {
  if (modelsPromise) return modelsPromise
  modelsPromise = (async () => {
    const t0 = Date.now()
    const fa = await importFaceApi()
    await Promise.all([
      fa.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    console.log(`[face/server] models loaded in ${Date.now() - t0}ms`)
  })().catch(e => { modelsPromise = null; throw e })
  return modelsPromise
}

// JPEG / data URL → tf.Tensor3D [H, W, 3] of uint8.
async function bufferToTensor(buf) {
  const fa = await importFaceApi()
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return fa.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32')
}

// Accepts a data URL (data:image/jpeg;base64,...) OR raw Buffer.
function decodeInput(input) {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') {
    const m = input.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/)
    if (m) return Buffer.from(m[1], 'base64')
    return Buffer.from(input, 'base64')
  }
  throw new Error('unsupported image input')
}

// Single descriptor extraction. Returns number[] (128-d) or null if no face.
export async function descriptorFromImage(input) {
  const fa = await importFaceApi()
  await loadModels()
  const buf = decodeInput(input)
  const tensor = await bufferToTensor(buf)
  try {
    const ssdOpts = new fa.SsdMobilenetv1Options({ minConfidence: 0.45 })
    const res = await fa
      .detectSingleFace(tensor, ssdOpts)
      .withFaceLandmarks()
      .withFaceDescriptor()
    return res?.descriptor ? Array.from(res.descriptor) : null
  } finally {
    tensor.dispose()
  }
}

// Match a target descriptor against the worker list. Same logic as browser.
function euclidean(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}

export function bestMatch(workers, target, threshold = 0.6) {
  if (!target || !Array.isArray(target)) return null
  let best = null
  for (const w of workers) {
    const list = Array.isArray(w.descriptors) && w.descriptors.length
      ? w.descriptors
      : (w.descriptor ? [w.descriptor] : [])
    for (const d of list) {
      if (!d || d.length !== target.length) continue
      const dist = euclidean(d, target)
      if (!best || dist < best.distance) best = { worker: w, distance: dist }
    }
  }
  return (best && best.distance <= threshold) ? best : null
}

// Convenience: image in → match out (loads models, extracts, matches).
export async function recognize(input, workers, threshold = 0.6) {
  const descriptor = await descriptorFromImage(input)
  if (!descriptor) return { match: null, descriptor: null, reason: 'no_face' }
  const match = bestMatch(workers, descriptor, threshold)
  if (!match) return { match: null, descriptor, reason: 'unknown' }
  return { match, descriptor, reason: null }
}
