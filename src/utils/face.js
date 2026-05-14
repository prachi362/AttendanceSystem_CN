// Face recognition using @vladmandic/face-api (maintained fork of face-api.js
// with retrained, more accurate models). Drop-in compatible API.
// Accuracy tweaks:
//  - SSD MobileNet detector (more accurate than TinyFaceDetector)
//  - Compute descriptors directly from the <video> element (avoids JPEG loss)
//  - Multi-pose enrollment: store an array of descriptors per worker and
//    match against the min distance across all of them
//
// Note: descriptors from the original face-api.js are NOT interchangeable with
// these — workers registered before the upgrade must re-register.
import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = 'https://vladmandic.github.io/face-api/model'

let loadingPromise = null
export function ensureModels() {
  if (loadingPromise) return loadingPromise
  loadingPromise = Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),       // accurate, used for enrollment
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),     // fast, used for punch loop
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).catch(err => { loadingPromise = null; throw err })
  return loadingPromise
}

// Accurate but heavier — use for registration where users hold still.
const ssdOptions  = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 })
// Light + fast — use for the live punch loop on low-end kiosk hardware.
const tinyOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })

async function descriptorFromInput(input, { fast = false } = {}) {
  await ensureModels()
  const opts = fast ? tinyOptions : ssdOptions
  const res = await faceapi
    .detectSingleFace(input, opts)
    .withFaceLandmarks()
    .withFaceDescriptor()
  return res?.descriptor ? Array.from(res.descriptor) : null
}

// Fast presence check — does the frame contain a face right now?
// Uses TinyFaceDetector (no landmarks, no descriptor) so it's cheap enough
// to poll every ~200ms for "trigger capture on first detection" UX.
export async function detectFace(videoEl) {
  if (!videoEl) return null
  await ensureModels()
  const det = await faceapi.detectSingleFace(videoEl, tinyOptions)
  return det || null
}

// Descriptor from a data URL (used as a fallback for registration photos already captured).
export async function descriptorFromDataUrl(dataUrl, opts) {
  const img = await faceapi.fetchImage(dataUrl)
  return descriptorFromInput(img, opts)
}

// Descriptor straight from the live <video> element — best quality (no JPEG compression loss).
export async function descriptorFromVideo(videoEl, opts) {
  if (!videoEl) return null
  return descriptorFromInput(videoEl, opts)
}

// Best of both: try the video first, fall back to the captured data URL.
// Pass { fast: true } to use the light TinyFaceDetector.
export async function bestDescriptor({ video, dataUrl, fast = false }) {
  try {
    if (video) {
      const d = await descriptorFromVideo(video, { fast })
      if (d) return d
    }
  } catch (e) { /* ignore, try fallback */ }
  if (dataUrl) {
    try { return await descriptorFromDataUrl(dataUrl, { fast }) } catch (e) { return null }
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
