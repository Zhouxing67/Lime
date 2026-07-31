import { writeFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const root = resolve(__dirname, "..")

const sharpPath = resolve(
  root,
  "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/lib/index.js"
)
const sharp = (await import(sharpPath)).default

const SIZE = 1060
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${SIZE}" y2="${SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a3e635"/>
      <stop offset="100%" stop-color="#65a30d"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${Math.round(SIZE * 0.2)}" fill="url(#g)"/>
  <text x="${SIZE / 2}" y="${SIZE * 0.66}" text-anchor="middle" fill="white" font-family="Georgia, serif" font-weight="bold" font-size="${SIZE * 0.49}">❝</text>
</svg>`

const png = await sharp(Buffer.from(svg)).png().toBuffer()

writeFileSync(resolve(root, "assets/icon.png"), png)
writeFileSync(resolve(root, "www/assets/icon.png"), png)
console.log("Icon generated:", png.length, "bytes")
