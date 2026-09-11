import { create } from "zustand";
import type { LonLat, Project, Selection } from "@/lib/types";

export type Mode = "navigate" | "select" | "paint" | "drawZone" | "drawLine" | "placeMarker" | "placeLabel" | "drawArrow";
export type PanelId = "map" | "factions" | "elements" | "events" | "camera" | "assets";

interface StudioState {
  projectId: string | null;
  project: Project | null;
  past: Project[];
  future: Project[];
  dirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  time: number;
  playing: boolean;
  loop: boolean;
  rate: number;
  mode: Mode;
  selection: Selection | null;
  activeFactionId: string | null;
  hoverCountry: string | null;
  draft: LonLat[];
  panel: PanelId;
  layersLoading: boolean;
  exportOpen: boolean;
  statusMessage: string;

  loadProject: (id: string, p: Project) => void;
  update: (fn: (p: Project) => void, opts?: { transient?: boolean }) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  setSaveStatus: (s: StudioState["saveStatus"]) => void;
  markSaved: () => void;
  setTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setLoop: (v: boolean) => void;
  setRate: (v: number) => void;
  setMode: (m: Mode) => void;
  select: (s: Selection | null) => void;
  setActiveFaction: (id: string | null) => void;
  setHoverCountry: (n: string | null) => void;
  setDraft: (d: LonLat[]) => void;
  setPanel: (p: PanelId) => void;
  setLayersLoading: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;
  setStatus: (m: string) => void;
}

export const useStudio = create<StudioState>((set, get) => ({
  projectId: null,
  project: null,
  past: [],
  future: [],
  dirty: false,
  saveStatus: "idle",
  time: 0,
  playing: false,
  loop: false,
  rate: 1,
  mode: "navigate",
  selection: null,
  activeFactionId: null,
  hoverCountry: null,
  draft: [],
  panel: "map",
  layersLoading: false,
  exportOpen: false,
  statusMessage: "",

  loadProject: (id, p) =>
    set({ projectId: id, project: p, past: [], future: [], dirty: false, time: 0, playing: false, selection: null, draft: [], activeFactionId: p.factions[0]?.id ?? null, saveStatus: "idle" }),
  update: (fn, opts) => {
    const state = get();
    if (!state.project) return;
    const next = structuredClone(state.project);
    fn(next);
    if (opts?.transient) set({ project: next, dirty: true });
    else set({ project: next, past: [...state.past.slice(-59), state.project], future: [], dirty: true });
  },
  snapshot: () => {
    const state = get();
    if (!state.project) return;
    set({ past: [...state.past.slice(-59), state.project], future: [] });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future].slice(0, 60), dirty: true });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, future: future.slice(1), past: [...past, project], dirty: true });
  },
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: () => set({ dirty: false, saveStatus: "saved" }),
  setTime: (t) => {
    const p = get().project;
    const max = p?.video.duration ?? 0;
    set({ time: Math.max(0, Math.min(max, t)) });
  },
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setRate: (rate) => set({ rate }),
  setMode: (mode) => set({ mode, draft: [] }),
  select: (selection) => set({ selection }),
  setActiveFaction: (activeFactionId) => set({ activeFactionId }),
  setHoverCountry: (hoverCountry) => set({ hoverCountry }),
  setDraft: (draft) => set({ draft }),
  setPanel: (panel) => set({ panel }),
  setLayersLoading: (layersLoading) => set({ layersLoading }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setStatus: (statusMessage) => set({ statusMessage }),
}));
