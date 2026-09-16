"use client";
import React from "react";
import {
  Camera as CameraIcon,
  CalendarClock,
  Captions,
  Flag,
  MapPin,
  PictureInPicture2,
  Spline,
  Split,
  Swords,
  Type,
  UserRoundCog,
} from "lucide-react";
import type { EventType } from "@/lib/studio/types";

/**
 * One base hue per event type. Every tone used in the timeline (lane fill,
 * border, left bar, label ink) is mixed out of this single value, so a clip
 * never needs a hand-picked pair of Tailwind colour classes.
 */
export const EVENT_COLOR: Record<EventType, string> = {
  year: "#d8b26a",
  camera: "#6fb3d2",
  territory: "#d09a6e",
  front: "#e07a4a",
  disintegrate: "#c98e9e",
  nationChange: "#c98e78",
  marker: "#d98080",
  text: "#8ca0d8",
  subtitle: "#9fbfe0",
  flags: "#7fa8be",
  inset: "#a8cc6e",
};

/**
 * Clip colours derived from the base hue.
 *
 * Tailwind cannot generate utilities from a runtime value, so these come back
 * as inline CSS. color-mix keeps the clip sitting *in* the lane rather than
 * floating on top of it, which is what the reference design does.
 */
export function clipStyle(type: EventType, selected: boolean): React.CSSProperties {
  const base = EVENT_COLOR[type];
  const mix = (pct: number, onto = "var(--color-wf-lane)") => `color-mix(in oklab, ${base} ${pct}%, ${onto})`;
  return {
    background: selected ? mix(26) : mix(14),
    borderColor: selected ? "var(--color-wf-accent)" : mix(22),
    color: `color-mix(in oklab, ${base} 78%, var(--color-wf-text))`,
    boxShadow: `inset 3px 0 0 0 ${mix(40)}`,
  };
}

/** Swatch used in the track header and the "add event" menu. */
export function EventSwatch({ type, className }: { type: EventType; className?: string }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-[2px] ${className ?? ""}`}
      style={{ background: `color-mix(in oklab, ${EVENT_COLOR[type]} 55%, var(--color-wf-lane))`, border: `1px solid ${EVENT_COLOR[type]}` }}
    />
  );
}

const ICONS: Record<EventType, React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>> = {
  year: CalendarClock,
  camera: CameraIcon,
  territory: Swords,
  front: Spline,
  disintegrate: Split,
  nationChange: UserRoundCog,
  marker: MapPin,
  text: Type,
  subtitle: Captions,
  flags: Flag,
  inset: PictureInPicture2,
};

export function EventIcon({ type, size = 13, className }: { type: EventType; size?: number; className?: string }) {
  const Cmp = ICONS[type];
  return <Cmp size={size} strokeWidth={1.75} className={className} />;
}
