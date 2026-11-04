/**
 * A six-point star (the Chicago flag star) rasterized as a signed distance field, so
 * MapLibre can tint it per category with `icon-color` and outline it with `icon-halo-*`.
 *
 * Encoding follows MapLibre's SDF convention: alpha 192 at the edge, falling by
 * 255 / SDF_RADIUS per pixel outward.
 */
export const STAR_PIXEL_RATIO = 2;
const SDF_RADIUS = 8; // image pixels of falloff on each side of the edge
const CUTOFF = 0.25;

export function starPoints(R: number, r = R * 0.48, cx = 0, cy = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    const q = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]);
  }
  return pts;
}

export function starPath(R: number, r = R * 0.48): string {
  return starPoints(R, r).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + "Z";
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inside(px: number, py: number, pts: [number, number][]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * @param radius star outer radius in CSS pixels
 * @returns RGBA image data (white, alpha = distance field) sized to fit the star plus falloff
 */
export function starSdf(radius: number): { width: number; height: number; data: Uint8Array } {
  const R = radius * STAR_PIXEL_RATIO;
  const size = Math.ceil(2 * (R + SDF_RADIUS + 2));
  const c = size / 2;
  const pts = starPoints(R, R * 0.48, c, c);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      let d = Infinity;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
        d = Math.min(d, segDist(px, py, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
      const signed = inside(px, py, pts) ? -d : d;
      const a = Math.round(255 - 255 * (signed / SDF_RADIUS + CUTOFF));
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.max(0, Math.min(255, a));
    }
  }
  return { width: size, height: size, data };
}

/** Diagonal hatch pattern for the 1871 burn area, in the given CSS color. */
export function hatchPattern(color: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const s = 8 * STAR_PIXEL_RATIO;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.strokeStyle = color;
  g.lineWidth = 1.6 * STAR_PIXEL_RATIO;
  g.globalAlpha = 0.55;
  g.beginPath();
  // two strokes so the pattern tiles seamlessly
  g.moveTo(-s / 2, s / 2); g.lineTo(s / 2, -s / 2);
  g.moveTo(0, s); g.lineTo(s, 0);
  g.moveTo(s / 2, s * 1.5); g.lineTo(s * 1.5, s / 2);
  g.stroke();
  return g.getImageData(0, 0, s, s);
}
