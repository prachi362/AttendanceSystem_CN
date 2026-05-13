// Face recognition using face-api.js.
// Accuracy tweaks:
//  - SSD MobileNet detector (more accurate than TinyFaceDetector)
//  - Compute descriptors directly from the <video> element (avoids JPEG loss)
//  - Multi-pose enrollment: store an array of descriptors per worker and
//    match against the min distance across all of them
import * as faceapi from 'face-api.js'

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'

let loadingPromise = null
export function ensureModels() {
  if (loadingPromise) return loadingPromise
  loadingPromise = Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).catch(err => { loadingPromise = null; throw err })
  return loadingPromise
}

// Stricter detector confidence => fewer junk detections, better alignment.
const detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })

async function descriptorFromInput(input) {
  await ensureModels()
  const res = await faceapi
    .detectSingleFace(input, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor()
  return res?.descriptor ? Array.from(res.descriptor) : null
}

// Descriptor from a data URL (used as a fallback for registration photos already captured).
export async function descriptorFromDataUrl(dataUrl) {
  const img = await faceapi.fetchImage(dataUrl)
  return descriptorFromInput(img)
}

// Descriptor straight from the live <video> element — best quality (no JPEG compression loss).
export async function descriptorFromVideo(videoEl) {
  if (!videoEl) return null
  return descriptorFromInput(videoEl)
}

// Best of both: try the video first, fall back to the captured data URL.
export async function bestDescriptor({ video, dataUrl }) {
  try {
    if (video) {
      const d = await descriptorFromVideo(video)
      if (d) return d
    }
  } catch (e) { /* ignore, try fallback */ }
  if (dataUrl) {
    try { return await descriptorFromDataUrl(dataUrl) } catch (e) { return null }
  }
  return null
}

export function euclidean(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

// Accepts workers with either:
//   { descriptor: number[] }                 (legacy single)
//   { descriptors: number[][] }              (multi-pose, preferred)
// Returns { worker, distance } or null if no candidate is within threshold.
export function bestMatch(workers, target, threshold = 0.5) {
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
  if (best && best.distance <= threshold) return best
  return null
}
