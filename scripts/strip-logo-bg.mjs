// One-off: produce a transparent-background version of public/logo.png by
// removing the light-blue background and keeping the white emblem/text.
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(__dirname, '..', 'public', 'logo.png')
const dst = path.resolve(__dirname, '..', 'public', 'logo.png') // overwrite

const img = sharp(src).ensureAlpha()
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info // channels = 4

// Light-blue background sits around (79, 165, 213). Anything close to that
// color becomes fully transparent; pixels closer to white stay opaque white.
const BG = { r: 79, g: 165, b: 213 }
const out = Buffer.alloc(data.length)

for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  // Distance from background colour (max ~441 for full opposite).
  const dBg = Math.hypot(r - BG.r, g - BG.g, b - BG.b)
  // Distance from pure white.
  const dW  = Math.hypot(255 - r, 255 - g, 255 - b)
  // Alpha based on how "white" the pixel is vs how "blue-bg" it is.
  let alpha
  if (dBg < 25) alpha = 0
  else if (dW < 25) alpha = 255
  else {
    // Soft blend in the transition band.
    const ratio = dBg / (dBg + dW)
    alpha = Math.round(Math.max(0, Math.min(1, (ratio - 0.35) / 0.30)) * 255)
  }
  out[i] = 255
  out[i + 1] = 255
  out[i + 2] = 255
  out[i + 3] = alpha
}

await sharp(out, { raw: { width, height, channels } }).png().toFile(dst)
console.log(`wrote transparent logo: ${dst} (${width}x${height})`)
