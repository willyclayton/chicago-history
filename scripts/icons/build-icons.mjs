#!/usr/bin/env node
// App icons: the red six-point star of the Chicago flag on the flag's light blue.
// Writes public/icons/*.png (committed). Run with `npm run icons` after changing this file.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/icons");

// Tokens from src/theme.css (light): --lake and --red.
const BLUE = "#B3DDF2";
const RED = "#D7172F";

/** A regular six-point star, point up, as in src/map/starIcon.ts (inner radius 0.48 R). */
function star(cx, cy, R, r = R * 0.48) {
  let d = "";
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    const q = i % 2 ? r : R;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * q).toFixed(2)} ${(cy + Math.sin(a) * q).toFixed(2)}`;
  }
  return d + "Z";
}

/**
 * `bleed`: full square (maskable and Apple icons, which the OS crops itself).
 * Otherwise a rounded square with transparent corners. `R` is the star's outer radius
 * as a share of the size; maskable icons keep it inside the 40% safe circle.
 */
function svg(size, { bleed, R }) {
  const c = size / 2;
  const bg = bleed ? `<rect width="${size}" height="${size}" fill="${BLUE}"/>` : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BLUE}"/>`;
  // two white bars, as on the flag, behind the star
  const bar = size * 0.085;
  const bars = `<rect y="${c - size * 0.2 - bar}" width="${size}" height="${bar}" fill="#fff" opacity=".55"/><rect y="${c + size * 0.2}" width="${size}" height="${bar}" fill="#fff" opacity=".55"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c">${bg.replace(/fill="[^"]+"/, "")}</clipPath></defs>
  ${bg}<g clip-path="url(#c)">${bars}</g>
  <path d="${star(c, c, size * R)}" fill="${RED}"/>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, bleed: false, R: 0.34 },
  { file: "icon-512.png", size: 512, bleed: false, R: 0.34 },
  { file: "icon-maskable-192.png", size: 192, bleed: true, R: 0.27 },
  { file: "icon-maskable-512.png", size: 512, bleed: true, R: 0.27 },
  { file: "apple-touch-icon.png", size: 180, bleed: true, R: 0.31 },
];

await mkdir(out, { recursive: true });
for (const i of ICONS) {
  const png = await sharp(Buffer.from(svg(i.size, i)))
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(out, i.file), png);
  console.log(`icons: ${i.file} ${png.length} bytes`);
}
await writeFile(path.join(out, "icon.svg"), svg(512, { bleed: false, R: 0.34 }) + "\n");
console.log("icons: icon.svg");
