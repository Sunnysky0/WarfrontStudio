import { useStudio } from "@/store/studio";
import { addArrow, addKeyframe, addLine, addZone, deleteElement, duplicateElement } from "@/lib/edit";
import { dateAtTime } from "@/lib/time";

export function currentDateMs(): number {
  const { project, time } = useStudio.getState();
  return project ? dateAtTime(project, time) : 0;
}

/** Finish an in-progress zone/line/arrow drawing. */
export function finishDraft() {
  const s = useStudio.getState();
  const { draft, mode, project } = s;
  if (!project) return;
  const ms = currentDateMs();
  if (mode === "drawZone" && draft.length >= 3) {
    const factionId = s.activeFactionId ?? project.factions[0]?.id ?? "";
    let created = "";
    s.update((p) => {
      created = addZone(p, draft, factionId, ms).id;
    });
    s.setDraft([]);
    s.select({ type: "zone", id: created });
    s.setMode("select");
    s.setStatus("Zone created – drag vertices to refine, move the playhead and drag again to animate.");
  } else if (mode === "drawLine" && draft.length >= 2) {
    let created = "";
    s.update((p) => {
      created = addLine(p, draft, ms).id;
    });
    s.setDraft([]);
    s.select({ type: "line", id: created });
    s.setMode("select");
    s.setStatus("Front line created.");
  } else if (mode === "drawArrow" && draft.length >= 2) {
    let created = "";
    s.update((p) => {
      created = addArrow(p, draft[0], draft[1], ms).id;
    });
    s.setDraft([]);
    s.select({ type: "arrow", id: created });
    s.setMode("select");
  } else {
    s.setDraft([]);
  }
}

export function cancelDraft() {
  const s = useStudio.getState();
  if (s.draft.length) s.setDraft([]);
  else if (s.selection) s.select(null);
  else s.setMode("navigate");
}

export function deleteSelection() {
  const s = useStudio.getState();
  if (!s.selection) return;
  const sel = s.selection;
  if (sel.type === "camera") {
    s.update((p) => {
      if (p.camera.keyframes.length > 1) p.camera.keyframes.splice(Number(sel.id), 1);
    });
  } else {
    s.update((p) => deleteElement(p, sel));
  }
  s.select(null);
}

export function duplicateSelection() {
  const s = useStudio.getState();
  if (!s.selection) return;
  const sel = s.selection;
  let next: typeof sel | null = null;
  s.update((p) => {
    next = duplicateElement(p, sel);
  });
  if (next) s.select(next);
}

export function addKeyframeNow() {
  const s = useStudio.getState();
  const sel = s.selection;
  if (!sel || (sel.type !== "zone" && sel.type !== "line")) return;
  const ms = currentDateMs();
  s.update((p) => addKeyframe(p, sel, ms));
  s.setStatus("Keyframe added at the current date.");
}

export function stepFrames(n: number) {
  const s = useStudio.getState();
  if (!s.project) return;
  s.setTime(s.time + n / s.project.video.fps);
}
