// Face recognition using face-api.js.
// Models are fetched from a public CDN the first time they're needed.
import * as faceapi from 'face-api.js'

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'

let loadingPromise = null
export function ensureModels() {
  if (loadingPromise) return loadingPromise
  loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).catch(err => { loadingPromise = null; throw err })
  return loadingPromise
}

// Returns Array(128) descriptor or null if no face found.
export async function descriptorFromDataUrl(dataUrl) {
  await ensureModels()
  const img = await faceapi.fetchImage(dataUrl)
  const res = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return res?.descriptor ? Array.from(res.descriptor) : null
}

export function euclidean(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

// Find the closest worker. workers must have `descriptor` arrays.
// threshold ~0.55: lower = stricter. Returns { worker, distance } or null.
export function bestMatch(workers, descriptor, threshold = 0.55) {
  let best = null
  for (const w of workers) {
    if (!w.descriptor || w.descriptor.length !== descriptor.length) continue
    const d = euclidean(w.descriptor, descriptor)
    if (!best || d < best.distance) best = { worker: w, distance: d }
  }
  if (best && best.distance <= threshold) return best
  return null
}
