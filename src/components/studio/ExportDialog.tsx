"use client";
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Image as ImageIcon, X } from "lucide-react";
import type { Basemap } from "@/lib/studio/basemap";
import { MapRenderer } from "@/lib/studio/renderer";
import { downloadBlob, exportFrame, exportVideo, webCodecsAvailable } from "@/lib/studio/export";
import { RESOLUTION_PRESETS } from "@/lib/studio/presets";
import type { ProjectDoc } from "@/lib/studio/types";
import { Button, Field, IconButton, NumberInput, Select } from "./ui";

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

  // Modal behaviour the dialog never had: Escape closes it, and focus starts
  // inside so a keyboard user isn't left tabbing through the studio behind it.
  const panelRef = useRef<HTMLDivElement>(null);
  const busy = !!progress;
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busy) return; // don't lose a render in progress to a stray Esc
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]" onClick={() => !busy && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wf-export-title"
        tabIndex={-1}
        className="w-[520px] rounded-wf-lg border border-wf-line bg-wf-surface p-5 text-wf-md text-wf-text-2 shadow-2xl shadow-black/70 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="wf-export-title" className="text-wf-xl font-semibold text-wf-text">
            Export video
          </h2>
          <IconButton title="Close" onClick={onClose} disabled={busy}>
            <X size={15} strokeWidth={2} />
          </IconButton>
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
        <p className="mt-3 text-wf-base leading-relaxed text-wf-text-4">
          <span className="tnum text-wf-text-2">
            {frames} frames at {w}×{h}
          </span>
          . {wc ? "Frame-accurate offline rendering via WebCodecs." : "WebCodecs is not available in this browser — falling back to real-time WebM recording."}
        </p>

        {progress && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-wf-base text-wf-text-3">
              <span>{progress.stage}</span>
              <span className="tnum">{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-wf-lane">
              <div className="h-full bg-wf-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-wf-md border border-wf-danger/40 bg-wf-danger/10 p-2 text-wf-base text-wf-danger">
            <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-3 flex items-start gap-2 rounded-wf-md border border-wf-ok/40 bg-wf-ok/10 p-2 text-wf-base text-wf-ok">
            <CheckCircle2 size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            <span>
              Exported <b className="font-semibold">{result.filename}</b> ({(result.size / 1e6).toFixed(1)} MB, {result.method}).{" "}
              <a href={result.url} download={result.filename} className="underline underline-offset-2 hover:no-underline wf-focus">
                Download again
              </a>
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button onClick={snapshot} disabled={busy}>
            <ImageIcon size={13} strokeWidth={1.75} />
            Snapshot frame (PNG)
          </Button>
          {busy ? (
            <Button variant="danger" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button variant="accent" size="md" onClick={run} disabled={!basemap}>
              <Download size={14} strokeWidth={1.75} />
              Render &amp; download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
