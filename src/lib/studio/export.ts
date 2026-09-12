import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import type { MapRenderer } from "./renderer";
import { preloadFlags, preloadFonts } from "./drawing";
import type { ProjectDoc } from "./types";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  format: "mp4" | "webm";
  start: number;
  end: number;
  onProgress?: (done: number, total: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  method: "webcodecs" | "mediarecorder";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function webCodecsAvailable(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined";
}

function collectFlags(project: ProjectDoc) {
  const specs = project.nations.map((n) => n.flag);
  for (const e of project.events) {
    if (e.type === "nationChange") specs.push(e.flag);
    if (e.type === "flags") specs.push(e.leftFaction, e.rightFaction);
  }
  return specs;
}

async function pickCodec(format: "mp4" | "webm", width: number, height: number, bitrate: number, fps: number): Promise<VideoEncoderConfig | null> {
  const candidates =
    format === "mp4"
      ? ["avc1.640033", "avc1.64002a", "avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"]
      : ["vp09.00.10.08", "vp09.00.40.08", "vp8"];
  for (const codec of candidates) {
    const cfg: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: "quality",
    };
    if (format === "mp4") (cfg as VideoEncoderConfig & { avc?: { format: string } }).avc = { format: "avc" };
    try {
      const res = await VideoEncoder.isConfigSupported(cfg);
      if (res.supported) return cfg;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Deterministic, frame-accurate export using WebCodecs (Chrome / Edge / recent Safari).
 */
async function exportWithWebCodecs(renderer: MapRenderer, opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps, format } = opts;
  const bitrate = Math.round(opts.bitrateMbps * 1e6);
  const cfg = await pickCodec(format, width, height, bitrate, fps);
  if (!cfg) throw new Error(`No supported ${format.toUpperCase()} encoder configuration for ${width}x${height}`);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const total = Math.max(1, Math.round((opts.end - opts.start) * fps));
  let muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget>;
  if (format === "mp4") {
    muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: "avc", width, height, frameRate: fps },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
  } else {
    muxer = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: cfg.codec.startsWith("vp8") ? "V_VP8" : "V_VP9", width, height, frameRate: fps },
      firstTimestampBehavior: "offset",
    });
  }
  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      (muxer as Mp4Muxer<Mp4Target>).addVideoChunk(chunk, meta as EncodedVideoChunkMetadata);
    },
    error: (e) => {
      encodeError = e as Error;
    },
  });
  encoder.configure(cfg);

  const frameDur = 1e6 / fps;
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      encoder.close();
      throw new Error("Export cancelled");
    }
    if (encodeError) throw encodeError;
    const t = opts.start + i / fps;
    renderer.render(ctx, width, height, t, { showHud: true, editorOverlay: false });
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await sleep(4);
    if (i % 3 === 0) {
      opts.onProgress?.(i + 1, total, "Rendering & encoding");
      await sleep(0);
    }
  }
  opts.onProgress?.(total, total, "Finalizing");
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  const buffer = (muxer.target as Mp4Target | WebmTarget).buffer;
  const blob = new Blob([buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
  return { blob, filename: `${safeName(renderer.project.name)}.${format}`, method: "webcodecs" };
}

/**
 * Real-time fallback using MediaRecorder (works everywhere, timing depends on render speed).
 */
async function exportWithMediaRecorder(renderer: MapRenderer, opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const stream = canvas.captureStream(fps);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrateMbps * 1e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  renderer.render(ctx, width, height, opts.start, { showHud: true });
  rec.start(250);
  const wall0 = performance.now();
  const duration = opts.end - opts.start;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (opts.signal?.aborted) return resolve();
      const el = (performance.now() - wall0) / 1000;
      const t = opts.start + Math.min(duration, el);
      renderer.render(ctx, width, height, t, { showHud: true });
      opts.onProgress?.(Math.min(duration, el), duration, "Recording in real time");
      if (el >= duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: "video/webm" }), filename: `${safeName(renderer.project.name)}.webm`, method: "mediarecorder" };
}

export async function exportVideo(renderer: MapRenderer, opts: ExportOptions): Promise<ExportResult> {
  opts.onProgress?.(0, 1, "Preloading assets");
  await preloadFlags(collectFlags(renderer.project));
  await preloadFonts([renderer.theme.labelFont, renderer.theme.hudFont]);
  if (webCodecsAvailable()) {
    try {
      return await exportWithWebCodecs(renderer, opts);
    } catch (e) {
      if ((e as Error).message === "Export cancelled") throw e;
      console.warn("WebCodecs export failed, falling back to MediaRecorder", e);
    }
  }
  return exportWithMediaRecorder(renderer, { ...opts, format: "webm" });
}

export async function exportFrame(renderer: MapRenderer, t: number, width: number, height: number): Promise<Blob> {
  await preloadFlags(collectFlags(renderer.project));
  await preloadFonts([renderer.theme.labelFont, renderer.theme.hudFont]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  renderer.render(ctx, width, height, t, { showHud: true });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9\-_]+/gi, "_").replace(/^_+|_+$/g, "") || "warfront";
}
