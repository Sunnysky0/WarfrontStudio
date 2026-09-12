"use client";
import React, { useEffect, useRef } from "react";
import { drawFlag } from "@/lib/studio/drawing";
import type { FlagSpec } from "@/lib/studio/types";

/**
 * Canvas flag thumbnail. Lives in its own module because both Inspector and
 * Panels need it — Panels used to import it from Inspector, coupling two
 * sibling panels together.
 *
 * drawFlag returns false when an SVG/image is still loading; we retry once so
 * the swatch fills in without a full re-render.
 */
export function FlagPreview({ spec, color, w = 48, h = 32 }: { spec?: FlagSpec; color?: string; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const ok = drawFlag(ctx, spec, 0, 0, w, h, color ?? "#555");
    if (!ok) {
      const t = setTimeout(() => {
        ctx.clearRect(0, 0, w, h);
        drawFlag(ctx, spec, 0, 0, w, h, color ?? "#555");
      }, 400);
      return () => clearTimeout(t);
    }
  }, [spec, color, w, h]);
  return <canvas ref={ref} width={w} height={h} className="shrink-0 rounded-[3px] border border-wf-line" />;
}

export default FlagPreview;
