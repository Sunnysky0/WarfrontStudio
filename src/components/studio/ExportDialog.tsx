"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useStudio } from "@/store/studio";
import { downloadBlob, exportVideo, supportsWebCodecs, type ExportResult } from "@/lib/export/exporter";
import { formatElapsed } from "@/lib/time";
import { Button, Field, NumberInput, Row, Select } from "./ui";
import { previewRenderer } from "./MapCanvas";

export default function ExportDialog() {
  const open = useStudio((s) => s.exportOpen);
  const setOpen = useStudio((s) => s.setExportOpen);
  const project = useStudio((s) => s.project);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [res, setRes] = useState("project");
  const [fps, setFps] = useState(30);
  const [bitrate, setBitrate] = useState(12);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    if (project) {
      setFps(project.video.fps);
      setRange({ start: 0, end: project.video.duration });
    }
  }, [project, open]);

  useEffect(() => {
    if (!supportsWebCodecs()) setFormat("webm");
  }, []);

  if (!open || !project) return null;

  const dims =
    res === "project"
      ? [project.video.width, project.video.height]
      : res === "1080"
        ? [1920, 1080]
        : res === "720"
          ? [1280, 720]
          : res === "4k"
            ? [3840, 2160]
            : [project.video.width, project.video.height];
  const [w, h] = dims;
  const start = range?.start ?? 0;
  const end = range?.end ?? project.video.duration;
  const frames = Math.max(1, Math.round((end - start) * fps));
  const running = !!progress && !result && !error;

  const run = async () => {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: frames, stage: "Starting…" });
    const ac = new AbortController();
    abortRef.current = ac;
    startedAt.current = performance.now();
    try {
      const r = await exportVideo(project, previewRenderer.layers, {
        width: w,
        height: h,
        fps,
        bitrateMbps: bitrate,
        format,
        startTime: start,
        endTime: end,
        signal: ac.signal,
        onProgress: (done, total, stage) => setProgress({ done, total, stage }),
      });
      setResult(r);
      downloadBlob(r.blob, r.filename);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const elapsed = progress ? (performance.now() - startedAt.current) / 1000 : 0;
  const eta = progress && progress.done > 0 ? (elapsed / progress.done) * (progress.total - progress.done) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Export video</h2>
          <button onClick={() => !running && setOpen(false)} className="text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <Row>
            <Field label="Format" hint={supportsWebCodecs() ? "WebCodecs available" : "WebCodecs unavailable – WebM only"}>
              <Select<"mp4" | "webm">
                value={format}
                onChange={setFormat}
                options={[
                  { value: "mp4", label: "MP4 (H.264) – frame accurate" },
                  { value: "webm", label: "WebM (VP9) – real-time recording" },
                ]}
              />
            </Field>
            <Field label="Resolution">
              <Select
                value={res}
                onChange={setRes}
                options={[
                  { value: "project", label: `Project (${project.video.width}×${project.video.height})` },
                  { value: "720", label: "720p (1280×720)" },
                  { value: "1080", label: "1080p (1920×1080)" },
                  { value: "4k", label: "4K (3840×2160)" },
                ]}
              />
            </Field>
            <Field label="Frame rate">
              <NumberInput value={fps} min={1} max={60} onChange={(v) => setFps(Math.round(v))} />
            </Field>
            <Field label="Bitrate (Mbps)">
              <NumberInput value={bitrate} min={1} max={80} onChange={setBitrate} />
            </Field>
            <Field label="From (s)">
              <NumberInput value={start} min={0} max={project.video.duration} step={0.5} onChange={(v) => setRange({ start: v, end })} />
            </Field>
            <Field label="To (s)">
              <NumberInput value={end} min={0} max={project.video.duration} step={0.5} onChange={(v) => setRange({ start, end: v })} />
            </Field>
          </Row>
          <div className="rounded bg-slate-950/60 p-2 text-[11px] text-slate-400">
            {w}×{h} · {fps} fps · {frames} frames · {formatElapsed(end - start)} · every frame is rendered deterministically from the timeline (no dropped frames in MP4 mode).
          </div>
          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>{result ? "Done" : error ? "Failed" : progress.stage}</span>
                <span>
                  {progress.done}/{progress.total} {running && progress.done > 2 && `· ~${Math.ceil(eta)}s left`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-slate-800">
                <div className={`h-full ${error ? "bg-red-500" : "bg-sky-500"}`} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {error && <div className="rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}
          {result && (
            <div className="rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-200">
              Exported {result.filename} ({(result.blob.size / 1e6).toFixed(1)} MB, {result.frames} frames). The download should have started –{" "}
              <button className="underline" onClick={() => downloadBlob(result.blob, result.filename)}>
                download again
              </button>
              .
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          {running ? (
            <Button variant="danger" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button variant="primary" onClick={run}>
                Render & export
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
