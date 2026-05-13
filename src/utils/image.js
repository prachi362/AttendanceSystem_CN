// Compress a video frame to a small JPEG data URL.
// maxWidth keeps the file small (~30-80 KB for faces).
export function captureCompressedJpeg(videoEl, { maxWidth = 480, quality = 0.7 } = {}) {
  if (!videoEl || !videoEl.videoWidth) return null
  const ratio = videoEl.videoHeight / videoEl.videoWidth
  const w = Math.min(maxWidth, videoEl.videoWidth)
  const h = Math.round(w * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // Mirror so the saved photo matches what user saw
  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(videoEl, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export function approxBytes(dataUrl) {
  if (!dataUrl) return 0
  const base64 = dataUrl.split(',')[1] || ''
  return Math.floor((base64.length * 3) / 4)
}
