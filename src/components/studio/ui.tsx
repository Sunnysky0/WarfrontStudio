"use client";

import type { ReactNode } from "react";

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="border-b border-slate-800/80 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {right}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Row({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-4" : "grid-cols-2"}`}>{children}</div>;
}

const inputCls = "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500";

export function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input className={`${inputCls} ${mono ? "font-mono" : ""}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function NumberInput({ value, onChange, step = 1, min, max }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <input
      type="number"
      className={inputCls}
      value={Number.isFinite(value) ? value : ""}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function DateInput({ value, onChange, allowEmpty }: { value: string | undefined; onChange: (v: string | undefined) => void; allowEmpty?: boolean }) {
  const valid = !value || /^-?\d{1,4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value);
  return (
    <input
      className={`${inputCls} font-mono ${valid ? "" : "border-red-500"}`}
      value={value ?? ""}
      placeholder={allowEmpty ? "YYYY-MM-DD (optional)" : "YYYY-MM-DD"}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === "" && allowEmpty ? undefined : v);
      }}
    />
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888";
  return (
    <div className="flex items-center gap-1">
      <input type="color" className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent p-0" value={hex} onChange={(e) => onChange(e.target.value)} />
      <input className={`${inputCls} font-mono`} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-xs text-slate-200 hover:bg-slate-800"
    >
      <span>{label}</span>
      <span className={`relative inline-block h-4 w-7 rounded-full transition ${checked ? "bg-sky-500" : "bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${checked ? "left-3.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function Slider({ value, onChange, min, max, step = 0.01 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <input type="range" className="w-full accent-sky-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />;
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "sm",
  disabled,
  title,
  className = "",
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  title?: string;
  className?: string;
  active?: boolean;
}) {
  const base = "inline-flex items-center justify-center gap-1 rounded font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const sizes = { xs: "px-1.5 py-0.5 text-[11px]", sm: "px-2 py-1 text-xs", md: "px-3 py-1.5 text-sm" }[size];
  const variants = {
    default: active ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    primary: "bg-sky-600 text-white hover:bg-sky-500",
    danger: "bg-red-700/80 text-white hover:bg-red-600",
    ghost: active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800",
  }[variant];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded border border-dashed border-slate-700 p-3 text-center text-[11px] text-slate-500">{children}</div>;
}
