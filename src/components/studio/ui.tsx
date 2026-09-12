"use client";
import React from "react";

export function Field({ label, children, hint, row }: { label: string; children: React.ReactNode; hint?: string; row?: boolean }) {
  return (
    <label className={`flex ${row ? "items-center justify-between gap-2" : "flex-col gap-1"} text-xs text-zinc-300`}>
      <span className="font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-[56px] ${props.className ?? ""}`} />;
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  className,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [text, setText] = React.useState(value === undefined ? "" : String(value));
  React.useEffect(() => {
    setText(value === undefined ? "" : String(Number.isInteger(value) ? value : +value.toFixed(3)));
  }, [value]);
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={`${inputCls} ${className ?? ""}`}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={`${inputCls} ${className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5" />
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono`} />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-zinc-300">
      <span>{label}</span>
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-block h-4 w-8 rounded-full transition ${checked ? "bg-violet-600" : "bg-zinc-700"}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${checked ? "left-4" : "left-0.5"}`} />
      </span>
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "sm",
  disabled,
  title,
  className,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center gap-1 rounded font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const sizes = { xs: "px-1.5 py-0.5 text-[10px]", sm: "px-2 py-1 text-xs", md: "px-3 py-1.5 text-sm" };
  const variants = {
    default: "border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
    primary: "bg-violet-600 text-white hover:bg-violet-500",
    danger: "border border-red-900 bg-red-950 text-red-200 hover:bg-red-900",
    ghost: "text-zinc-300 hover:bg-zinc-800",
  };
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
        {right}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function Chip({ children, onRemove, title }: { children: React.ReactNode; onRemove?: () => void; title?: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200">
      <span className="truncate">{children}</span>
      {onRemove && (
        <button onClick={onRemove} className="text-zinc-500 hover:text-red-400" title="Remove">
          ×
        </button>
      )}
    </span>
  );
}
