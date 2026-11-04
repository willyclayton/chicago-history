/**
 * Demo photos for building and reviewing the media UI before the real archive photos
 * arrive from CI. Loaded only when the URL has `?mediaDemo` (see source.ts). Every image
 * is a generated SVG drawing, stamped "DEMO IMAGE", with archive "Demo" so the UI badges it.
 */
import type { MediaImage, MediaKind } from "../../data/media";

type Tone = "sepia" | "grey" | "faded" | "colour";

const W = 1200;
const H = 800;

/* ---------- drawing helpers ---------- */

const r = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra ? " " + extra : ""}/>`;

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function windows(x: number, y: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number, fill: string, lit = "", seed = 1) {
  const rnd = rand(seed);
  let out = "";
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) out += r(x + i * (w + gx), y + j * (h + gy), w, h, lit && rnd() > 0.7 ? lit : fill);
  return out;
}

function building(x: number, y: number, w: number, h: number, body: string, win: string, seed: number, cols?: number) {
  const c = cols ?? Math.max(2, Math.floor((w - 20) / 34));
  const ww = (w - 24) / c - 10;
  const rows = Math.max(1, Math.floor((h - 40) / 46));
  return r(x, y, w, h, body) + r(x - 4, y - 10, w + 8, 12, body, 'opacity=".85"') + windows(x + 14, y + 22, c, rows, ww, 26, 10, 20, win, "", seed);
}

const person = (x: number, y: number, c: string, s = 1) =>
  `<g fill="${c}" transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-58" r="8"/><rect x="-9" y="-50" width="18" height="34" rx="7"/><rect x="-8" y="-20" width="7" height="20"/><rect x="1" y="-20" width="7" height="20"/></g>`;

function crowd(x0: number, x1: number, y: number, n: number, seed: number, colors: string[], s = 1) {
  const rnd = rand(seed);
  let out = "";
  for (let i = 0; i < n; i++) out += person(x0 + rnd() * (x1 - x0), y + rnd() * 26, colors[i % colors.length], s * (0.85 + rnd() * 0.3));
  return out;
}

const wheel = (x: number, y: number, rr: number, c = "#1a1a1a") => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${rr * 0.4}" fill="#8a8a8a"/>`;

function carriage(x: number, y: number, c = "#2b2118") {
  return `<g fill="${c}"><ellipse cx="${x + 40}" cy="${y - 52}" rx="40" ry="17"/><rect x="${x + 68}" y="${y - 86}" width="14" height="36" rx="6" transform="rotate(20 ${x + 75} ${y - 68})"/><rect x="${x + 6}" y="${y - 40}" width="6" height="40"/><rect x="${x + 22}" y="${y - 40}" width="6" height="40"/><rect x="${x + 54}" y="${y - 40}" width="6" height="40"/><rect x="${x + 68}" y="${y - 40}" width="6" height="40"/><rect x="${x - 110}" y="${y - 92}" width="96" height="58" rx="6"/></g>${wheel(x - 92, y - 18, 20)}${wheel(x - 30, y - 18, 20)}`;
}

function car(x: number, y: number, era: 1920 | 1950 | 2020, c: string) {
  if (era === 1920)
    return `<g fill="${c}"><rect x="${x}" y="${y - 52}" width="150" height="30" rx="4"/><rect x="${x + 40}" y="${y - 86}" width="78" height="38" rx="3"/></g><rect x="${x + 50}" y="${y - 80}" width="26" height="22" fill="#cfd6da" opacity=".7"/><rect x="${x + 82}" y="${y - 80}" width="26" height="22" fill="#cfd6da" opacity=".7"/>${wheel(x + 30, y - 18, 19)}${wheel(x + 122, y - 18, 19)}`;
  if (era === 1950)
    return `<path d="M${x} ${y - 24} q0 -30 30 -32 l30 -26 h90 l34 26 q46 2 46 32 z" fill="${c}"/><path d="M${x + 66} ${y - 78} h80 l26 22 h-126z" fill="#d7dee2" opacity=".6"/>${wheel(x + 52, y - 18, 18)}${wheel(x + 180, y - 18, 18)}`;
  return `<path d="M${x} ${y - 22} q0 -26 24 -28 l40 -28 h86 l44 28 q40 2 40 28 z" fill="${c}"/><path d="M${x + 70} ${y - 74} h76 l32 22 h-130z" fill="#203040" opacity=".75"/>${wheel(x + 50, y - 16, 17)}${wheel(x + 176, y - 16, 17)}`;
}

const tree = (x: number, y: number, s: number, c: string) =>
  `<rect x="${x - 5 * s}" y="${y - 50 * s}" width="${10 * s}" height="${50 * s}" fill="#5a4330"/><circle cx="${x}" cy="${y - 78 * s}" r="${38 * s}" fill="${c}"/><circle cx="${x - 26 * s}" cy="${y - 58 * s}" r="${26 * s}" fill="${c}"/><circle cx="${x + 26 * s}" cy="${y - 60 * s}" r="${28 * s}" fill="${c}"/>`;

const sky = (top: string, bottom: string) =>
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>${r(0, 0, W, H, "url(#sky)")}`;

const street = (y: number, road: string, walk: string) => r(0, y, W, H - y, road) + r(0, y, W, 26, walk) + r(0, y + 26, W, 3, "#000", 'opacity=".15"');

function smoke(seed: number, x0: number, x1: number, y: number) {
  const rnd = rand(seed);
  let out = `<g filter="url(#blur)" opacity=".85">`;
  for (let i = 0; i < 14; i++) out += `<circle cx="${x0 + rnd() * (x1 - x0)}" cy="${y - rnd() * 260}" r="${60 + rnd() * 90}" fill="${rnd() > 0.5 ? "#5d5a57" : "#3f3c3a"}"/>`;
  return out + "</g>";
}

/* ---------- scenes ---------- */

/** Randolph St: the Iroquois (1903) and, on the same lot, the Oriental/Nederlander. */
function randolph(era: 1903 | 1958 | 2024, aftermath = false) {
  const now = era === 2024;
  let s = now ? sky("#6fa6dc", "#d7e8f5") : sky("#c9cfd3", "#eef0ee");
  s += building(0, 150, 330, 500, now ? "#7b8fa3" : "#8a6450", now ? "#2d4b66" : "#3a2b22", 3);
  s += building(870, 90, 330, 560, now ? "#b9c3cb" : "#7d5b47", now ? "#3c5872" : "#33261e", 4);
  if (era === 1903) {
    s += r(360, 120, 480, 520, "#d6c49e") + r(350, 108, 500, 20, "#bfae8a") + r(360, 290, 480, 14, "#bfae8a");
    s += windows(392, 150, 6, 2, 50, 54, 20, 26, "#4a3c30");
    s += `<path d="M470 640 V430 A130 130 0 0 1 730 430 V640 Z" fill="#2c231d"/>`;
    s += r(452, 330, 22, 310, "#e6d7b4") + r(726, 330, 22, 310, "#e6d7b4");
    s += r(470, 316, 260, 40, "#3a2b20") + `<text x="600" y="345" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="30" letter-spacing="6" fill="#efe3c4">IROQUOIS</text>`;
  } else {
    s += r(360, 60, 480, 580, now ? "#e7dccb" : "#cfc5b5") + r(350, 50, 500, 18, now ? "#d4c6b0" : "#b8ae9f");
    s += windows(392, 90, 6, 4, 50, 52, 20, 24, now ? "#33495d" : "#3d3a36");
    s += r(410, 110, 54, 280, now ? "#b21f2d" : "#5a5550") + `<text transform="translate(447 125) rotate(90)" font-family="Arial,sans-serif" font-weight="900" font-size="38" letter-spacing="8" fill="${now ? "#ffe9a8" : "#f2f2f2"}">ORIENTAL</text>`;
    s += r(390, 392, 420, 62, now ? "#1f1f24" : "#2a2a2a");
    s += `<text x="600" y="436" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="34" letter-spacing="3" fill="${now ? "#ffd86b" : "#eeeeee"}">${now ? "NEDERLANDER" : "ORIENTAL"}</text>`;
    s += windows(398, 398, 26, 1, 4, 4, 11.5, 0, now ? "#ffe9a8" : "#dddddd") + windows(398, 446, 26, 1, 4, 4, 11.5, 0, now ? "#ffe9a8" : "#dddddd");
    s += r(440, 470, 320, 170, "#2a2420") + windows(456, 486, 4, 1, 60, 140, 14, 0, now ? "#7a5a3c" : "#4c443d");
  }
  s += street(640, now ? "#55595e" : "#6f6558", now ? "#9ea3a8" : "#8f8676");
  if (era === 1903) {
    s += carriage(220, 760) + carriage(1040, 780, "#3a2d22");
    s += crowd(480, 760, 640, aftermath ? 26 : 9, 7, ["#2a221c", "#3b3028", "#1d1814"]);
    if (aftermath) s += smoke(3, 340, 900, 260) + carriage(700, 790, "#6b2a22") + crowd(60, 400, 700, 14, 11, ["#2a221c", "#1d1814"]);
  } else if (era === 1958) {
    s += car(140, 770, 1950, "#3c3c3c") + car(760, 790, 1950, "#6b6b6b") + crowd(470, 760, 640, 7, 5, ["#2a2a2a", "#4a4a4a"]);
  } else {
    s += car(120, 772, 2020, "#c0392b") + car(800, 792, 2020, "#e8e8e8") + crowd(450, 780, 640, 8, 9, ["#1f3a5a", "#7a2e2e", "#2e2e2e", "#c88a2e"]);
  }
  return s;
}

/** 2122 N. Clark St: the S-M-C Cartage garage, and the lawn that replaced it. */
function clark(era: 1929 | 1967 | 2024, onlookers = false) {
  const now = era === 2024;
  let s = now ? sky("#7cb2e2", "#e2eef7") : sky("#cfd2d2", "#f0efea");
  s += building(0, 250, 300, 410, "#8e5440", "#2f241f", 21);
  if (now) {
    s += r(300, 560, 600, 100, "#6f9a4a") + r(300, 612, 600, 48, "#5f8a3c");
    s += tree(390, 600, 1.2, "#3f7a35") + tree(560, 590, 1.4, "#4a8a3a") + tree(760, 600, 1.15, "#3f7a35");
    for (let x = 304; x < 900; x += 12) s += r(x, 600, 3, 60, "#2b2b2b");
    s += r(300, 600, 600, 4, "#2b2b2b");
    s += building(880, 170, 320, 490, "#b07a5c", "#3a4f60", 22);
  } else {
    s += building(880, 190, 320, 470, "#7a4a38", "#2b211c", 22);
    s += r(320, 430, 560, 230, "#8b4a35") + r(312, 418, 576, 18, "#73402f");
    s += r(380, 452, 440, 40, "#efe6cf") + `<text x="600" y="482" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="26" letter-spacing="3" fill="#3a2a20">S-M-C CARTAGE CO.</text>`;
    s += r(520, 516, 160, 144, "#2a2622") + windows(352, 520, 2, 1, 58, 60, 16, 0, "#3a3430") + windows(722, 520, 2, 1, 58, 60, 16, 0, "#3a3430");
    for (let y = 440; y < 660; y += 14) s += r(320, y, 560, 1.5, "#000", 'opacity=".12"');
  }
  s += street(660, now ? "#5a5e63" : "#6a6157", now ? "#a7abaf" : "#93897a");
  if (era === 1929) {
    s += car(90, 760, 1920, "#1b1b1b") + car(760, 780, 1920, "#222222") + car(960, 770, 1920, "#151515");
    s += crowd(380, 860, 660, onlookers ? 40 : 12, 4, ["#1c1916", "#2c2621", "#3c342c"], onlookers ? 1.25 : 1);
  } else if (era === 1967) s += car(820, 780, 1950, "#5a5a5a") + crowd(400, 700, 660, 3, 3, ["#333"]);
  else s += car(80, 780, 2020, "#2d6cb5") + crowd(600, 900, 660, 3, 8, ["#7a2e2e", "#1f3a5a"]);
  return s;
}

/** Inside a garage: a bare brick wall and a parked truck (a stand-in for a photo flagged graphic). */
function garageInside() {
  let s = r(0, 0, W, H, "#4a3a30");
  for (let y = 0; y < 600; y += 22) for (let x = (y / 22) % 2 ? -30 : 0; x < W; x += 60) s += r(x + 2, y + 2, 56, 18, "#7d4a36");
  s += r(0, 600, W, 200, "#3a3631") + r(0, 600, W, 6, "#2a2622");
  s += `<rect x="760" y="380" width="360" height="200" rx="10" fill="#1f1c19"/><rect x="1010" y="330" width="120" height="120" rx="8" fill="#26221e"/>${wheel(830, 590, 34)}${wheel(1050, 590, 34)}`;
  s += r(80, 240, 60, 180, "#2a2420") + `<rect x="0" y="0" width="${W}" height="${H}" fill="#000" opacity=".25"/>`;
  return s;
}

/** Wacker Dr from across the river: the tower going up, finished, and today. */
function wacker(era: 1971 | 1973 | 2004 | 2024) {
  const colour = era >= 2004;
  let s = colour ? sky("#5d9ad6", "#cfe3f3") : sky("#a9b8c2", "#e6e8e4");
  const rnd = rand(17);
  for (let x = -20; x < W; x += 70 + rnd() * 50) {
    const h = 160 + rnd() * 230;
    s += building(x, 680 - h, 64 + rnd() * 40, h, colour ? "#8e98a0" : "#8b8a84", colour ? "#41566a" : "#4a4a46", Math.floor(rnd() * 99), 2);
  }
  if (era === 2024) s += r(170, 210, 120, 470, "#6f97b8") + windows(182, 226, 4, 18, 18, 14, 9, 11, "#a8c8e0") + r(930, 160, 110, 520, "#7fa6c4") + windows(942, 176, 3, 20, 22, 14, 10, 10, "#b8d4ea");
  const black = "#1c1c20";
  const top = era === 1971 ? 430 : 0;
  const sec = (x: number, y: number, w: number) => (Math.max(y, top) < 680 ? r(x, Math.max(y, top), w, 680 - Math.max(y, top), black) : "");
  s += sec(500, 330, 200) + sec(540, 230, 160) + sec(540, 150, 120) + sec(580, 90, 80);
  for (let y = Math.max(100, top) + 10; y < 680; y += 9) s += r(500, y, 200, 1.2, "#5a4a3a", `opacity=".35"`);
  if (era === 1971) {
    for (let x = 500; x <= 700; x += 20) s += r(x, 300, 2, 130, "#2a2a2a");
    for (let y = 300; y < 430; y += 16) s += r(500, y, 200, 2, "#2a2a2a");
    s += r(596, 120, 8, 180, "#c8a038") + r(520, 120, 200, 8, "#c8a038") + r(706, 128, 2, 80, "#333");
  }
  if (era >= 2004) s += r(596, 10, 4, 80, "#d9d9d9") + r(640, 20, 4, 70, "#d9d9d9");
  if (era === 2024) s += `<text x="620" y="300" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="16" fill="#e8e8e8" letter-spacing="2">WILLIS</text>`;
  s += r(0, 680, W, 22, colour ? "#7d7a74" : "#8a8580") + r(0, 702, W, 98, colour ? "#2f6f8f" : "#5f6a6e");
  for (let i = 0; i < 26; i++) s += r(rnd() * W, 712 + rnd() * 80, 40 + rnd() * 90, 3, "#fff", `opacity="${colour ? 0.25 : 0.15}"`);
  s += r(560, 712, 120, 80, black, 'opacity=".25"');
  return s;
}

/** Michigan Ave: the Water Tower, its 1871 ruins, and today's towers. */
function michigan(era: 1869 | 1871 | 1925 | 2024) {
  const now = era === 2024;
  let s = now ? sky("#6aa7de", "#d9eaf6") : era === 1871 ? sky("#8e8a84", "#cfc7bb") : sky("#c7ccd0", "#eeeeea");
  if (era === 1869) s += building(40, 520, 220, 140, "#8a6a52", "#3a2c22", 31, 4) + building(940, 500, 230, 160, "#7e604a", "#33281f", 32, 4);
  if (era === 1871) {
    s += `<path d="M20 660 L40 520 L70 560 L90 470 L130 540 L150 660Z M880 660 L900 500 L930 540 L960 450 L1000 560 L1030 520 L1060 660Z M200 660 L220 590 L250 610 L270 560 L300 660Z" fill="#3a3632"/>`;
    s += smoke(9, 0, 1200, 330);
  }
  if (era === 1925) s += building(0, 300, 330, 360, "#b5ab9a", "#3f3c38", 33) + building(870, 260, 330, 400, "#a99f8e", "#3a3733", 34);
  if (now) s += building(-10, 60, 300, 600, "#9fb3c4", "#3f5d78", 35) + r(880, 20, 300, 640, "#7ea0bf") + windows(896, 40, 7, 26, 26, 14, 14, 10, "#b6d0e6") + building(300, 330, 120, 330, "#c9c2b6", "#4a5560", 36, 2);
  const stone = era === 1871 ? "#cdbf9f" : "#e2d6b4";
  const shade = "#bfb08c";
  s += r(470, 470, 260, 190, stone) + r(462, 460, 276, 16, shade);
  for (const x of [470, 700]) s += r(x - 6, 400, 42, 260, stone) + windows(x - 6, 388, 4, 1, 7, 14, 4.6, 0, stone);
  s += r(560, 140, 80, 330, stone) + r(548, 128, 104, 22, shade) + windows(548, 112, 6, 1, 10, 18, 8.8, 0, stone);
  s += r(580, 60, 40, 70, stone) + `<path d="M574 62 L600 22 L626 62Z" fill="${shade}"/>`;
  s += `<path d="M580 660 V600 A20 20 0 0 1 620 600 V660Z" fill="#3a3028"/>` + windows(586, 200, 1, 4, 28, 40, 0, 26, "#4a4036");
  s += street(660, now ? "#55595e" : "#7a6f60", now ? "#a2a6aa" : "#958a78");
  if (era === 1869) s += carriage(260, 770) + crowd(760, 980, 660, 4, 2, ["#2a221c"]);
  if (era === 1871) s += crowd(300, 900, 660, 10, 6, ["#2a221c", "#3a2f27"]);
  if (era === 1925) s += car(120, 770, 1920, "#1e1e1e") + car(820, 790, 1920, "#2c2c2c") + crowd(320, 460, 660, 4, 3, ["#2a2a2a"]);
  if (now) s += tree(330, 668, 1, "#4a8a3a") + tree(870, 668, 1.1, "#3f7a35") + car(60, 780, 2020, "#e8e8e8") + car(820, 790, 2020, "#1d4f91") + crowd(420, 780, 660, 7, 12, ["#7a2e2e", "#1f3a5a", "#c88a2e"]);
  return s;
}

/** A front page, laid out with grey bars for text (no invented words). */
function frontPage(seed: number, year: number, extra: boolean) {
  const w = 900;
  const h = 1200;
  const rnd = rand(seed);
  let s = r(0, 0, w, h, "#ece3cf");
  s += `<text x="${w / 2}" y="110" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="74" fill="#1d1a16">The Demo Daily</text>`;
  s += r(40, 132, w - 80, 4, "#1d1a16") + r(40, 170, w - 80, 2, "#1d1a16");
  s += `<text x="40" y="160" font-family="Georgia,serif" font-size="20" fill="#1d1a16">${year}</text><text x="${w - 40}" y="160" text-anchor="end" font-family="Georgia,serif" font-size="20" fill="#1d1a16">DEMO EDITION</text>`;
  if (extra) s += `<text x="${w / 2}" y="300" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="140" fill="#1d1a16">EXTRA</text>`;
  const hy = extra ? 330 : 200;
  s += r(70, hy, w - 140, 54, "#2a2620") + r(130, hy + 72, w - 260, 34, "#3a352e");
  s += r(60, hy + 140, 460, 330, "#9c958a") + r(80, hy + 160, 420, 290, "#b8b1a4") + crowd(110, 480, hy + 420, 14, seed, ["#4a453e", "#5a554d"], 1.4);
  const col = (x: number, y0: number, y1: number, cw: number) => {
    let c = "";
    for (let y = y0; y < y1; y += 20) c += r(x, y, cw * (0.7 + rnd() * 0.3), 9, "#5f594f", `opacity="${0.55 + rnd() * 0.25}"`);
    return c;
  };
  s += col(550, hy + 140, h - 60, 290) + col(60, hy + 500, h - 60, 210) + col(300, hy + 500, h - 60, 210);
  s += r(530, hy + 140, 1.5, h - hy - 200, "#1d1a16") + r(280, hy + 500, 1.5, h - hy - 560, "#1d1a16");
  return { body: s, w, h };
}

/* ---------- tone, grain and the DEMO stamp ---------- */

const TONE: Record<Exclude<Tone, "colour">, string> = {
  sepia: `<feColorMatrix type="matrix" values=".393 .769 .189 0 0 .349 .686 .168 0 0 .272 .534 .131 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="linear" slope=".92" intercept=".05"/><feFuncG type="linear" slope=".9" intercept=".04"/><feFuncB type="linear" slope=".85" intercept=".03"/></feComponentTransfer>`,
  grey: `<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.08" intercept="-.03"/><feFuncG type="linear" slope="1.08" intercept="-.03"/><feFuncB type="linear" slope="1.08" intercept="-.03"/></feComponentTransfer>`,
  faded: `<feColorMatrix type="saturate" values=".5"/><feComponentTransfer><feFuncR type="linear" slope=".86" intercept=".1"/><feFuncG type="linear" slope=".82" intercept=".08"/><feFuncB type="linear" slope=".72" intercept=".06"/></feComponentTransfer>`,
};

function toSvg(body: string, tone: Tone, w = W, h = H): string {
  const old = tone === "sepia" || tone === "grey";
  const filter = tone === "colour" ? "" : `<filter id="tone" color-interpolation-filters="sRGB">${TONE[tone]}</filter>`;
  const stamp = `<g font-family="Arial,Helvetica,sans-serif" font-weight="700"><rect x="${w - 232}" y="${h - 60}" width="208" height="38" rx="19" fill="#000" fill-opacity=".6"/><text x="${w - 128}" y="${h - 35}" text-anchor="middle" font-size="17" letter-spacing="3" fill="#fff">DEMO IMAGE</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${filter}<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><radialGradient id="vig" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${old ? 0.5 : 0.18}"/></radialGradient></defs><g${filter ? ' filter="url(#tone)"' : ""}>${body}</g>${old || tone === "faded" ? `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="${old ? 0.2 : 0.1}" style="mix-blend-mode:multiply"/>` : ""}<rect width="${w}" height="${h}" fill="url(#vig)"/>${stamp}</svg>`;
}

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/* ---------- the fixture ---------- */

interface Spec {
  year: number;
  kind: MediaKind;
  caption: string;
  tone: Tone;
  draw: () => string | { body: string; w: number; h: number };
  sameView?: string;
  approx?: boolean;
  /** Stands in for a real photo flagged graphic, to exercise the blur-and-reveal UI. */
  sensitive?: boolean;
}

const SPECS: Record<string, Spec[]> = {
  iroquois: [
    { year: 1903, kind: "place", tone: "sepia", sameView: "randolph", caption: "The Iroquois Theater's Randolph Street front in its first weeks.", draw: () => randolph(1903) },
    { year: 1903, kind: "aftermath", tone: "sepia", caption: "Crowds and fire wagons outside the theater on the evening of the fire.", draw: () => randolph(1903, true) },
    { year: 1904, kind: "newspaper", tone: "sepia", caption: "A front page reporting the fire and the search for the dead.", draw: () => frontPage(5, 1904, false) },
    { year: 1958, kind: "place", tone: "grey", sameView: "randolph", approx: true, caption: "The Oriental Theatre, built on the same lot in 1926, in the 1950s.", draw: () => randolph(1958) },
    { year: 2024, kind: "today", tone: "colour", sameView: "randolph", caption: "The James M. Nederlander Theatre on Randolph Street today.", draw: () => randolph(2024) },
  ],
  valentine: [
    { year: 1929, kind: "event", tone: "sepia", sameView: "clark", caption: "Police cars outside the S-M-C Cartage garage on Feb. 14, 1929.", draw: () => clark(1929) },
    { year: 1929, kind: "aftermath", tone: "sepia", sensitive: true, caption: "Inside the garage after the shooting (flagged graphic in the demo).", draw: () => garageInside() },
    { year: 1929, kind: "newspaper", tone: "sepia", caption: "An extra edition on the streets within hours of the shooting.", draw: () => frontPage(11, 1929, true) },
    { year: 1929, kind: "newspaper", tone: "sepia", caption: "The next morning's front page, with a photo of the garage.", draw: () => frontPage(23, 1929, false) },
    { year: 1929, kind: "people", tone: "sepia", caption: "Onlookers crowd North Clark Street outside the garage.", draw: () => clark(1929, true) },
    { year: 1967, kind: "place", tone: "grey", sameView: "clark", caption: "The garage shortly before it was torn down in 1967.", draw: () => clark(1967) },
    { year: 2024, kind: "today", tone: "colour", sameView: "clark", caption: "The fenced lawn where the garage stood, today.", draw: () => clark(2024) },
  ],
  sears: [
    { year: 1971, kind: "construction", tone: "faded", sameView: "river", caption: "The tower's black steel frame rising above Wacker Drive.", draw: () => wacker(1971) },
    { year: 1973, kind: "place", tone: "faded", sameView: "river", caption: "Just finished: the world's tallest building.", draw: () => wacker(1973) },
    { year: 2004, kind: "place", tone: "colour", sameView: "river", caption: "Twenty years ago: the Sears Tower and its twin antennas.", draw: () => wacker(2004) },
    { year: 2024, kind: "today", tone: "colour", sameView: "river", caption: "Willis Tower today, seen across the Chicago River.", draw: () => wacker(2024) },
  ],
  watertower: [
    { year: 1869, kind: "place", tone: "sepia", sameView: "michigan", caption: "The new Water Tower on Pine Street, now Michigan Avenue.", draw: () => michigan(1869) },
    { year: 1871, kind: "aftermath", tone: "sepia", caption: "The tower still standing in the burned district after the Great Fire.", draw: () => michigan(1871) },
    { year: 1925, kind: "place", tone: "grey", sameView: "michigan", approx: true, caption: "The tower among the new buildings of North Michigan Avenue.", draw: () => michigan(1925) },
    { year: 2024, kind: "today", tone: "colour", sameView: "michigan", caption: "The Water Tower today, ringed by high-rises.", draw: () => michigan(2024) },
  ],
};

const built = new Map<string, MediaImage[]>();

/** Demo photos for a site, or null if the site has none (use the real media then). */
export function demoMedia(siteId: string): MediaImage[] | null {
  const specs = SPECS[siteId];
  if (!specs) return null;
  let items = built.get(siteId);
  if (!items) {
    items = specs.map((sp, i) => {
      const d = sp.draw();
      const { body, w, h } = typeof d === "string" ? { body: d, w: W, h: H } : d;
      const src = uri(toSvg(body, sp.tone, w, h));
      return {
        id: `${siteId}-demo-${i + 1}`,
        siteId,
        src,
        thumb: src,
        width: w,
        height: h,
        year: sp.year,
        approx: sp.approx,
        caption: sp.caption,
        kind: sp.kind,
        sameView: sp.sameView,
        credit: "Generated placeholder, not a real photo",
        license: "Demo only",
        sourceUrl: "",
        archive: "Demo",
        ...(sp.sensitive ? { sensitive: true } : {}),
      } as MediaImage;
    });
    built.set(siteId, items);
  }
  return items.slice().sort((a, b) => a.year - b.year);
}
