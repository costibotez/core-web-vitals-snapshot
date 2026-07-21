/**
 * Generates the toolbar/store icons from an inline SVG using sharp.
 * Run: npm run icons  (writes public/icons/icon-{16,32,48,128}.png)
 *
 * The mark: a pulse/heartbeat line on the dark slate rounded square, with the
 * brand orange as the accent — instrument, not advert.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#1a2332"/>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="none" stroke="#2c3a52" stroke-width="2"/>
  <path d="M20 72 H44 L54 46 L70 92 L80 64 H108"
        fill="none" stroke="#ff7a18" stroke-width="10"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="108" cy="64" r="7" fill="#22c55e"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
  console.log(`icon-${size}.png`);
}
