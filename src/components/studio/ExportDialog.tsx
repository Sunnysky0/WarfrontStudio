"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Basemap } from "@/lib/studio/basemap";
import { MapRenderer } from "@/lib/studio/renderer";
import { downloadBlob, exportFrame, exportVideo, webCodecsAvailable } from "@/lib/studio/export";
import { RESOLUTION_PRESETS } from "@/lib/studio/presets";
import type { ProjectDoc } from "@/lib/studio/types";
import { Button, Field, NumberInput, Select } from "./ui";

export default function ExportDialog({ project, basemap, time, onClose }: { project: ProjectDoc; basemap: Basemap | null; time: number; onClose: () => void }) {
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [fps, setFps] = useState(30);
  const [res, setRes] = useState(`${project.map.width}x${project.map.height}`);
  const [bitrate, setBitrate] = useState(12);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(project.duration);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string; size: number; method: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [wc, setWc] = useState(true);
  useEffect(() => setWc(webCodecsAvailable()), []);

  const [w, h] = res.split("x").map(Number);
  const frames = Math.round((end - start) * fps);

  const run = async () => {
    setError(null);
    setResult(null);
    const r = new MapRenderer(project);
    r.setBasemap(basemap);
    abort.current = new AbortController();
    try {
      const out = await exportVideo(r, {
        width: w,
        height: h,
        fps,
        bitrateMbps: bitrate,
        format,
        start,
        end,
        signal: abort.current.signal,
        onProgress: (done, total, stage) => setProgress({ done, total, stage }),
      });
      const url = URL.createObjectURL(out.blob);
      setResult({ url, filename: out.filename, size: out.blob.size, method: out.method });
      downloadBlob(out.blob, out.filename);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const snapshot = async () => {
    const r = new MapRenderer(project);
    r.setBasemap(basemap);
    const blob = await exportFrame(r, time, w, h);
    downloadBlob(blob, `${project.name.replace(/[^a-z0-9]+/gi, "_")}_${time.toFixed(1)}s.png`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => !progress && onClose()}>
      <div className="w-[520px] rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-xs text-zinc-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Export video</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <Select
              value={format}
              onChange={setFormat}
              options={[
                { value: "mp4", label: "MP4 (H.264)" },
                { value: "webm", label: "WebM (VP9)" },
              ]}
            />
          </Field>
          <Field label="Resolution">
            <Select
              value={res}
              onChange={setRes}
              options={[
                { value: `${project.map.width}x${project.map.height}`, label: `Project (${project.map.width}×${project.map.height})` },
                ...RESOLUTION_PRESETS.filter((r) => !(r.width === project.map.width && r.height === project.map.height)).map((r) => ({ value: `${r.width}x${r.height}`, label: r.label })),
              ]}
            />
          </Field>
          <Field label="Frame rate">
            <Select value={String(fps)} onChange={(v) => setFps(+v)} options={["24", "30", "60"].map((f) => ({ value: f, label: `${f} fps` }))} />
          </Field>
          <Field label="Bitrate (Mbps)">
            <NumberInput value={bitrate} min={1} max={80} onChange={setBitrate} />
          </Field>
          <Field label="Start (s)">
            <NumberInput value={start} min={0} step={0.5} onChange={(v) => setStart(Math.max(0, Math.min(v, end - 0.5)))} />
          </Field>
          <Field label="End (s)">
            <NumberInput value={end} min={0.5} step={0.5} max={project.duration} onChange={(v) => setEnd(Math.min(project.duration, Math.max(v, start + 0.5)))} />
          </Field>
        </div>
        <p className="mt-3 text-[11px] text-zinc-400">
          {frames} frames at {w}×{h}.{" "}
          {wc ? "Frame-accurate offline rendering via WebCodecs." : "WebCodecs is not available in this browser – falling back to real-time WebM recording."}
        </p>
        {progress && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px]">
              <span>{progress.stage}</span>
              <span>{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}
        {error && <div className="mt-3 rounded border border-red-900 bg-red-950/50 p-2 text-red-200">{error}</div>}
        {result && (
          <div className="mt-3 rounded border border-emerald-900 bg-emerald-950/40 p-2 text-emerald-200">
            Exported <b>{result.filename}</b> ({(result.size / 1e6).toFixed(1)} MB, {result.method}).{" "}
            <a href={result.url} download={result.filename} className="underline">
              Download again
            </a>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <Button onClick={snapshot} disabled={!!progress}>
            Snapshot current frame (PNG)
          </Button>
          <div className="flex gap-2">
            {progress ? (
              <Button variant="danger" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={run} disabled={!basemap}>
                Render & download
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
