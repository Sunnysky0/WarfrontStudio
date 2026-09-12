import type { FlagSpec, MarkerKind } from "./types";

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- noise
/** Deterministic smooth 1D value noise in [-1, 1] */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const r = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return r(i) * (1 - u) + r(i + 1) * u;
}

/** Periodic noise around a circle (so start == end) */
export function ringNoise(angle: number, octaves: number, seed: number, t = 0): number {
  const n = 12;
  let v = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const x = ((angle / (Math.PI * 2)) * n * freq + t) % (n * freq);
    // wrap so the last segment interpolates toward the first
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const r = (k: number) => {
      const kk = ((k % (n * freq)) + n * freq) % (n * freq);
      const s = Math.sin(kk * 127.1 + seed * 311.7 + o * 71.3) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };
    v += (r(i) * (1 - u) + r(i + 1) * u) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

// ---------------------------------------------------------------- flags
const imageCache = new Map<string, HTMLImageElement>();
const imageLoading = new Map<string, Promise<HTMLImageElement | null>>();

export function flagImageUrl(spec: FlagSpec): string | null {
  if (spec.kind === "iso") return `/flags/${spec.code.toUpperCase()}.svg`;
  if (spec.kind === "image") return spec.url;
  return null;
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (imageCache.has(url)) return Promise.resolve(imageCache.get(url)!);
  if (imageLoading.has(url)) return imageLoading.get(url)!;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageLoading.set(url, p);
  return p;
}

export function getCachedImage(url: string): HTMLImageElement | null {
  const img = imageCache.get(url);
  if (img) return img;
  void loadImage(url);
  return null;
}

/** Ask the browser to load the first family of each CSS font stack so canvas text uses it. */
export async function preloadFonts(stacks: string[]): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const families = Array.from(new Set(stacks.map((s) => s.split(",")[0].trim().replace(/^['"]|['"]$/g, ""))));
  try {
    await Promise.all(families.flatMap((f) => [document.fonts.load(`600 20px "${f}"`), document.fonts.load(`800 20px "${f}"`), document.fonts.load(`500 20px "${f}"`)]));
    await document.fonts.ready;
  } catch {
    /* ignore – fallback fonts are used */
  }
}

export async function preloadFlags(specs: (FlagSpec | undefined)[]): Promise<void> {
  const urls = new Set<string>();
  for (const s of specs) {
    if (!s) continue;
    const u = flagImageUrl(s);
    if (u) urls.add(u);
  }
  await Promise.all(Array.from(urls).map((u) => loadImage(u)));
}

function drawStar(ctx: Ctx, cx: number, cy: number, r: number, points = 5, inner = 0.42, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawEmblem(ctx: Ctx, emblem: NonNullable<Extract<FlagSpec, { kind: "custom" }>["emblem"]>, x: number, y: number, w: number, h: number) {
  const cx = x + w * (emblem.x ?? 0.5);
  const cy = y + h * (emblem.y ?? 0.5);
  const r = h * (emblem.size ?? 0.3);
  ctx.fillStyle = emblem.color;
  ctx.strokeStyle = emblem.color;
  switch (emblem.shape) {
    case "star":
      drawStar(ctx, cx, cy, r);
      break;
    case "octastar": {
      // eight-rayed star with dots, ala the template's Heavenly Republic emblem
      ctx.lineWidth = Math.max(1, r * 0.12);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "circle":
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "sun": {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.1);
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
        ctx.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15);
        ctx.stroke();
      }
      break;
    }
    case "crescent": {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx + r * 0.38, cy - r * 0.08, r * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "cross":
      ctx.fillRect(cx - r * 0.18, cy - r, r * 0.36, r * 2);
      ctx.fillRect(cx - r, cy - r * 0.18, r * 2, r * 0.36);
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.7, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case "hammer": {
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r * 0.85);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.75, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
      break;
    }
    case "trident": {
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);
      ctx.lineTo(cx, cy - r * 0.9);
      ctx.moveTo(cx - r * 0.6, cy - r * 0.2);
      ctx.lineTo(cx - r * 0.6, cy - r * 0.9);
      ctx.moveTo(cx + r * 0.6, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.9);
      ctx.moveTo(cx - r * 0.6, cy - r * 0.2);
      ctx.quadraticCurveTo(cx, cy + r * 0.4, cx + r * 0.6, cy - r * 0.2);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** Draw a flag into a rect. Returns false when an image flag is not loaded yet. */
export function drawFlag(ctx: Ctx, spec: FlagSpec | undefined, x: number, y: number, w: number, h: number, fallbackColor = "#666"): boolean {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  let ok = true;
  if (!spec) {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(x, y, w, h);
  } else if (spec.kind === "iso" || spec.kind === "image") {
    const url = flagImageUrl(spec)!;
    const img = getCachedImage(url);
    if (img) ctx.drawImage(img, x, y, w, h);
    else {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(x, y, w, h);
      ok = false;
    }
  } else {
    const colors = spec.colors.length ? spec.colors : [fallbackColor];
    if (spec.layout === "solid") {
      ctx.fillStyle = colors[0];
      ctx.fillRect(x, y, w, h);
    } else if (spec.layout === "horizontal") {
      const sh = h / colors.length;
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(x, y + i * sh, w, sh + 0.5);
      });
    } else {
      const sw = w / colors.length;
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(x + i * sw, y, sw + 0.5, h);
      });
    }
    if (spec.border) {
      ctx.strokeStyle = spec.border;
      ctx.lineWidth = Math.max(2, h * 0.12);
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    }
    if (spec.emblem && spec.emblem.shape !== "none") drawEmblem(ctx, spec.emblem, x, y, w, h);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  return ok;
}

// ---------------------------------------------------------------- markers
export const MARKER_KINDS: { id: MarkerKind; label: string }[] = [
  { id: "nuke", label: "Nuclear strike" },
  { id: "explosion", label: "Explosion / strike" },
  { id: "fire", label: "Fire / bombardment" },
  { id: "battle", label: "Battle (crossed swords)" },
  { id: "skull", label: "Massacre / disaster" },
  { id: "star", label: "Capital / key point" },
  { id: "ship", label: "Naval landing" },
  { id: "plane", label: "Air raid" },
  { id: "tank", label: "Armored offensive" },
  { id: "flag", label: "Flag / occupation" },
  { id: "gas", label: "Chemical weapons" },
  { id: "missile", label: "Ballistic missile" },
  { id: "siege", label: "Siege" },
  { id: "revolt", label: "Revolt / uprising" },
];

function trefoil(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 6;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a0 + Math.PI / 3);
    ctx.arc(0, 0, r * 0.35, a0 + Math.PI / 3, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a marker icon. `phase` is a 0-1 progress used for pulse/animation, `age` in seconds.
 */
export function drawMarker(ctx: Ctx, kind: MarkerKind, x: number, y: number, size: number, color: string, age: number, pulse = true) {
  const s = size;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const pulseR = pulse ? (age * 1.2) % 1 : 0;
  // pulse ring
  if (pulse) {
    ctx.beginPath();
    ctx.arc(x, y, s * (0.7 + pulseR * 1.4), 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6 * (1 - pulseR);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.9;
  switch (kind) {
    case "nuke": {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(x, y, s * 0.72, 0, Math.PI * 2);
      ctx.fill();
      trefoil(ctx, x, y, s * 0.62, color);
      break;
    }
    case "explosion": {
      ctx.fillStyle = color;
      drawStar(ctx, x, y, s * 0.9, 9, 0.5, age * 2);
      ctx.fillStyle = "#fff7c8";
      drawStar(ctx, x, y, s * 0.45, 9, 0.5, age * 2);
      break;
    }
    case "fire": {
      const flicker = 1 + 0.12 * Math.sin(age * 17) + 0.08 * Math.sin(age * 29 + 1);
      const g = ctx.createRadialGradient(x, y + s * 0.4, 0, x, y, s * 1.3 * flicker);
      g.addColorStop(0, "#fff3a3");
      g.addColorStop(0.35, color);
      g.addColorStop(1, "rgba(255,80,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.2 * flicker);
      ctx.bezierCurveTo(x + s * 0.9, y - s * 0.2, x + s * 0.7, y + s * 0.5, x, y + s * 0.6);
      ctx.bezierCurveTo(x - s * 0.7, y + s * 0.5, x - s * 0.9, y - s * 0.2, x, y - s * 1.2 * flicker);
      ctx.fill();
      break;
    }
    case "battle": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, s * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y - s * 0.8);
      ctx.lineTo(x + s * 0.8, y + s * 0.8);
      ctx.moveTo(x + s * 0.8, y - s * 0.8);
      ctx.lineTo(x - s * 0.8, y + s * 0.8);
      ctx.stroke();
      ctx.lineWidth = Math.max(2, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.55, y + s * 0.85);
      ctx.lineTo(x - s * 0.25, y + s * 0.55);
      ctx.moveTo(x + s * 0.55, y + s * 0.85);
      ctx.lineTo(x + s * 0.25, y + s * 0.55);
      ctx.stroke();
      break;
    }
    case "skull": {
      ctx.fillStyle = "#f4f4f4";
      ctx.beginPath();
      ctx.arc(x, y - s * 0.15, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - s * 0.4, y + s * 0.2, s * 0.8, s * 0.5);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x - s * 0.28, y - s * 0.2, s * 0.2, 0, Math.PI * 2);
      ctx.arc(x + s * 0.28, y - s * 0.2, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - s * 0.25, y + s * 0.3, s * 0.1, s * 0.3);
      ctx.fillRect(x - s * 0.05, y + s * 0.3, s * 0.1, s * 0.3);
      ctx.fillRect(x + s * 0.15, y + s * 0.3, s * 0.1, s * 0.3);
      break;
    }
    case "star": {
      ctx.fillStyle = color;
      drawStar(ctx, x, y, s * 0.9);
      break;
    }
    case "ship": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x + s * 0.6, y + s * 0.6);
      ctx.lineTo(x - s * 0.7, y + s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - s * 0.35, y - s * 0.55, s * 0.8, s * 0.55);
      ctx.fillRect(x - s * 0.1, y - s * 0.95, s * 0.2, s * 0.45);
      break;
    }
    case "plane": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.22, y - s * 0.2);
      ctx.lineTo(x + s, y + s * 0.25);
      ctx.lineTo(x + s, y + s * 0.5);
      ctx.lineTo(x + s * 0.18, y + s * 0.25);
      ctx.lineTo(x + s * 0.12, y + s * 0.7);
      ctx.lineTo(x + s * 0.4, y + s * 0.9);
      ctx.lineTo(x + s * 0.4, y + s);
      ctx.lineTo(x, y + s * 0.9);
      ctx.lineTo(x - s * 0.4, y + s);
      ctx.lineTo(x - s * 0.4, y + s * 0.9);
      ctx.lineTo(x - s * 0.12, y + s * 0.7);
      ctx.lineTo(x - s * 0.18, y + s * 0.25);
      ctx.lineTo(x - s, y + s * 0.5);
      ctx.lineTo(x - s, y + s * 0.25);
      ctx.lineTo(x - s * 0.22, y - s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "tank": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - s, y, s * 2, s * 0.6, s * 0.3);
      ctx.fill();
      ctx.fillRect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.5);
      ctx.fillRect(x, y - s * 0.3, s * 1.1, s * 0.14);
      break;
    }
    case "flag": {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, s * 0.15);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y + s);
      ctx.lineTo(x - s * 0.6, y - s);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y - s);
      ctx.lineTo(x + s * 0.9, y - s * 0.6);
      ctx.lineTo(x - s * 0.6, y - s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "gas": {
      const t = age * 0.8;
      for (let i = 0; i < 4; i++) {
        const a = t + (i * Math.PI) / 2;
        const px = x + Math.cos(a) * s * 0.4;
        const py = y + Math.sin(a) * s * 0.4;
        const g = ctx.createRadialGradient(px, py, 0, px, py, s * 0.8);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(px, py, s * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "missile": {
      ctx.fillStyle = color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.3, s * 0.5);
      ctx.lineTo(s * 0.6, s);
      ctx.lineTo(-s * 0.6, s);
      ctx.lineTo(-s * 0.3, s * 0.5);
      ctx.lineTo(-s * 0.3, -s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "siege": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, s * 0.2);
      ctx.setLineDash([s * 0.35, s * 0.25]);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.9, age * 1.5, age * 1.5 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "revolt": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y + s * 0.2, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, s * 0.18);
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.2);
      ctx.lineTo(x + s * 0.2, y - s * 0.9);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
