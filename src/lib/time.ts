import type { Project } from "./types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const DAY_MS = 86400000;

/** Parse an ISO-like date string ("1914-07-28" or "1914-07-28T05:00") as UTC ms. */
export function parseDate(s: string | undefined | null): number {
  if (!s) return NaN;
  const m = /^(-?\d{1,4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2})(?::(\d{1,2}))?)?/.exec(s.trim());
  if (!m) {
    const d = Date.parse(s);
    return isNaN(d) ? NaN : d;
  }
  const y = +m[1];
  const d = new Date(Date.UTC(2000, +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0));
  d.setUTCFullYear(y);
  return d.getTime();
}

export function toISODate(ms: number, withTime = false): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${String(y).padStart(4, "0")}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime ? `${base}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : base;
}

export function formatDate(ms: number, format: string): string {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const mo = d.getUTCMonth();
  const y = d.getUTCFullYear();
  switch (format) {
    case "DD.MM.YYYY":
      return `${String(day).padStart(2, "0")}.${String(mo + 1).padStart(2, "0")}.${y}`;
    case "MMMM D, YYYY":
      return `${MONTHS_LONG[mo]} ${day}, ${y}`;
    case "YYYY-MM-DD":
      return toISODate(ms);
    case "D MMM YYYY":
    default:
      return `${day} ${MONTHS[mo]} ${y}`;
  }
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Sorted pacing points with guaranteed endpoints. */
export function pacingPoints(project: Project): { t: number; ms: number }[] {
  const start = parseDate(project.time.start);
  const end = parseDate(project.time.end);
  const pts = (project.time.pacing || [])
    .map((p) => ({ t: p.t, ms: parseDate(p.date) }))
    .filter((p) => isFinite(p.t) && isFinite(p.ms))
    .sort((a, b) => a.t - b.t);
  const result: { t: number; ms: number }[] = [];
  if (!pts.length || pts[0].t > 0) result.push({ t: 0, ms: start });
  for (const p of pts) result.push(p);
  const dur = project.video.duration;
  if (result[result.length - 1].t < dur) result.push({ t: dur, ms: end });
  return result;
}

/** Map video time (s) to historical date (ms). */
export function dateAtTime(project: Project, t: number): number {
  const pts = pacingPoints(project);
  if (t <= pts[0].t) return pts[0].ms;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.ms + (b.ms - a.ms) * f;
    }
  }
  return pts[pts.length - 1].ms;
}

/** Map historical date (ms) to video time (s). */
export function timeAtDate(project: Project, ms: number): number {
  const pts = pacingPoints(project);
  if (ms <= pts[0].ms) return pts[0].t;
  for (let i = 1; i < pts.length; i++) {
    if (ms <= pts[i].ms) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = b.ms === a.ms ? 1 : (ms - a.ms) / (b.ms - a.ms);
      return a.t + (b.t - a.t) * f;
    }
  }
  return pts[pts.length - 1].t;
}

export function isActive(from: string | undefined, to: string | undefined, ms: number): boolean {
  if (from) {
    const f = parseDate(from);
    if (isFinite(f) && ms < f) return false;
  }
  if (to) {
    const t = parseDate(to);
    if (isFinite(t) && ms > t) return false;
  }
  return true;
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
