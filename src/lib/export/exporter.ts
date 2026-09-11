import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { Project } from "../types";
import { FrameRenderer, type LayerData } from "../render/renderer";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  format: "mp4" | "webm";
  startTime?: number;
  endTime?: number;
  onProgress?: (done: number, total: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  frames: number;
  seconds: number;
}

export function supportsWebCodecs(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

function avcCodecFor(width: number, height: number): string {
  const px = width * height;
  if (px > 1920 * 1088) return "avc1.640033"; // High 5.1 (4K)
  if (px > 1280 * 720) return "avc1.640028"; // High 4.0 (1080p)
  return "avc1.64001f"; // High 3.1 (720p)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function exportVideo(project: Project, layers: LayerData, opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const start = Math.max(0, opts.startTime ?? 0);
  const end = Math.min(project.video.duration, opts.endTime ?? project.video.duration);
  const total = Math.max(1, Math.round((end - start) * fps));
  const renderer = new FrameRenderer();
  renderer.setLayers(layers);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const safeName = project.name.replace(/[^\w\-]+/g, "_").slice(0, 60) || "warfront";

  if (opts.format === "mp4" && supportsWebCodecs()) {
    const codec = avcCodecFor(width, height);
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: Math.round(opts.bitrateMbps * 1_000_000),
      framerate: fps,
      latencyMode: "quality",
    };
    const support = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (!support.supported) throw new Error(`H.264 encoding (${codec}) is not supported by this browser – try WebM.`);
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
    let encodeError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => (encodeError = e as Error),
    });
    encoder.configure(config);
    const frameUs = 1_000_000 / fps;
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) {
        encoder.close();
        throw new Error("Export cancelled");
      }
      if (encodeError) throw encodeError;
      const t = start + i / fps;
      renderer.render(ctx, project, t, { width, height, forExport: true });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 8) await sleep(4);
      if (i % 3 === 0) {
        opts.onProgress?.(i + 1, total, "Rendering & encoding");
        await sleep(0);
      }
    }
    opts.onProgress?.(total, total, "Finalising MP4");
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    return { blob, filename: `${safeName}.mp4`, frames: total, seconds: total / fps };
  }

  // ---- WebM via MediaRecorder (real-time paced) ----
  if (typeof MediaRecorder === "undefined") throw new Error("This browser supports neither WebCodecs nor MediaRecorder.");
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(opts.bitrateMbps * 1_000_000) });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  renderer.render(ctx, project, start, { width, height, forExport: true });
  rec.start(500);
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      rec.stop();
      throw new Error("Export cancelled");
    }
    const t = start + i / fps;
    renderer.render(ctx, project, t, { width, height, forExport: true });
    track.requestFrame?.();
    opts.onProgress?.(i + 1, total, "Recording WebM (real-time)");
    const target = t0 + ((i + 1) * 1000) / fps;
    const wait = target - performance.now();
    await sleep(Math.max(0, wait));
  }
  await sleep(200);
  rec.stop();
  await stopped;
  const blob = new Blob(chunks, { type: "video/webm" });
  return { blob, filename: `${safeName}.webm`, frames: total, seconds: total / fps };
}

export async function renderPng(project: Project, layers: LayerData, t: number, width: number, height: number): Promise<Blob> {
  const renderer = new FrameRenderer();
  renderer.setLayers(layers);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  renderer.render(ctx, project, t, { width, height, forExport: true });
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
