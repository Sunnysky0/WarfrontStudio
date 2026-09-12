"use client";
import React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Flag, Layers, Shapes } from "lucide-react";
import type { LeftTab } from "../Panels";

const ITEMS: { id: LeftTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: "layers", label: "Layers", icon: <Layers size={17} strokeWidth={1.75} />, title: "Map layers and project setup" },
  { id: "nations", label: "Nations", icon: <Flag size={17} strokeWidth={1.75} />, title: "Nations, colours and flags" },
  { id: "assets", label: "Assets", icon: <Shapes size={17} strokeWidth={1.75} />, title: "Flags, markers and palette" },
  { id: "help", label: "Guide", icon: <BookOpen size={17} strokeWidth={1.75} />, title: "How to build a warfront video" },
];

export default function IconRail({ tab, onTab }: { tab: LeftTab; onTab: (t: LeftTab) => void }) {
  return (
    <nav
      className="flex shrink-0 flex-col items-center gap-1 border-r border-wf-line bg-wf-bg py-2"
      style={{ width: "var(--wf-w-rail)" }}
      aria-label="Studio sections"
    >
      {ITEMS.map((it) => {
        const on = it.id === tab;
        return (
          <button
            key={it.id}
            type="button"
            title={it.title}
            aria-current={on}
            onClick={() => onTab(it.id)}
            className={`relative flex w-13 cursor-pointer flex-col items-center gap-1 rounded-wf-xl px-1 py-2 transition-colors duration-150 wf-focus ${
              on ? "bg-wf-raised-2 text-wf-accent-text" : "text-wf-text-4 hover:bg-wf-raised hover:text-wf-text-2"
            }`}
          >
            {on && <span className="absolute top-1/2 -left-2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-wf-accent" />}
            {it.icon}
            <span className="text-wf-xs font-semibold uppercase tracking-[0.06em]">{it.label}</span>
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Link
          href="/"
          title="Back to projects"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-wf-xl text-wf-text-4 transition-colors duration-150 hover:bg-wf-raised hover:text-wf-text-2 wf-focus"
        >
          <ArrowLeft size={17} strokeWidth={1.75} />
        </Link>
      </div>
    </nav>
  );
}
