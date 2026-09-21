"use client";
import React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/* ---------------------------------------------------------------------------
   Shared studio primitives. Everything visual in the editor chrome should be
   composed from this file — the home page pulls from it too, which is what
   keeps the two screens looking like one product.

   The first ten exports (Field .. Chip) are load-bearing: ~40 call sites in
   Inspector/Panels/Timeline depend on their current names and signatures.
--------------------------------------------------------------------------- */

export const focusCls = "wf-focus";

export function Field({ label, children, hint, row }: { label: string; children: React.ReactNode; hint?: string; row?: boolean }) {
  return (
    <label className={`flex ${row ? "items-center justify-between gap-2" : "flex-col gap-1"} text-wf-md text-wf-text-2`}>
      <span className="text-wf-xs font-semibold uppercase tracking-[0.08em] text-wf-text-3">{label}</span>
      {children}
      {hint && <span className="text-wf-sm leading-snug text-wf-text-4">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-wf-md border border-wf-line bg-wf-lane px-2 py-1.5 text-wf-md text-wf-text placeholder:text-wf-text-4 transition-colors duration-150 outline-none hover:border-wf-line-warm focus:border-wf-accent/60 focus:bg-wf-raised disabled:cursor-not-allowed disabled:opacity-40 wf-focus";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-[56px] leading-relaxed ${props.className ?? ""}`} />;
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
  const formatted = value === undefined ? "" : String(Number.isInteger(value) ? value : +value.toFixed(3));
  const [text, setText] = React.useState(formatted);
  const [editing, setEditing] = React.useState(false);
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={editing ? text : formatted}
      onFocus={() => {
        setText(formatted);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={`${inputCls} tnum ${className ?? ""}`}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${inputCls} cursor-pointer appearance-none pr-7 ${className ?? ""}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-wf-raised text-wf-text">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-wf-text-4" />
    </div>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={value}
        className="h-7 w-9 shrink-0 cursor-pointer rounded-wf-md border border-wf-line bg-wf-lane p-0.5 transition-colors duration-150 hover:border-wf-line-warm wf-focus"
      />
      <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className={`${inputCls} font-mono text-wf-sm tracking-wide uppercase`} />
    </div>
  );
}

/** Real button + role=switch — this used to be a click handler on a <span>. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-wf-md text-wf-text-2">
      <span className={disabled ? "opacity-40" : undefined}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-8 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 wf-focus ${
          checked ? "border-wf-accent/40 bg-wf-accent" : "border-wf-line bg-wf-raised-2"
        }`}
      >
        <span
          className={`absolute top-[2px] h-3 w-3 rounded-full transition-all duration-150 ${
            checked ? "left-[17px] bg-wf-accent-ink" : "left-[2px] bg-wf-text-4"
          }`}
        />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex cursor-pointer items-center gap-2 text-left text-wf-md text-wf-text-2 transition-colors duration-150 hover:text-wf-text disabled:cursor-not-allowed disabled:opacity-40 wf-focus"
    >
      <span
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors duration-150 ${
          checked ? "border-wf-accent bg-wf-accent text-wf-accent-ink" : "border-wf-line bg-wf-lane text-transparent group-hover:border-wf-line-warm"
        }`}
      >
        <Check size={10} strokeWidth={3} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-wf-xs font-semibold uppercase tracking-[0.08em] text-wf-text-3">{label}</span>
          <span className="tnum text-wf-sm text-wf-text-2">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-4 cursor-pointer wf-focus"
      />
    </div>
  );
}

type ButtonVariant = "default" | "primary" | "accent" | "danger" | "ghost" | "subtle" | "outline";

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
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-wf-md font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 wf-focus";
  const sizes = {
    xs: "h-6 px-2 text-wf-sm",
    sm: "h-7 px-2.5 text-wf-md",
    md: "h-8 px-3 text-wf-lg",
  };
  const variants: Record<ButtonVariant, string> = {
    default: "border border-wf-line bg-wf-raised text-wf-text-2 hover:border-wf-line-warm hover:bg-wf-raised-2 hover:text-wf-text",
    // `primary` is kept as an alias for `accent` so existing call sites work.
    primary: "bg-wf-accent text-wf-accent-ink hover:bg-wf-accent-hi",
    accent: "bg-wf-accent text-wf-accent-ink hover:bg-wf-accent-hi",
    danger: "border border-wf-danger/30 bg-wf-danger/10 text-wf-danger hover:border-wf-danger/50 hover:bg-wf-danger/20",
    ghost: "text-wf-text-3 hover:bg-wf-raised-2 hover:text-wf-text",
    subtle: "bg-wf-accent-soft text-wf-accent-text hover:bg-wf-accent-mid",
    outline: "border border-wf-accent/40 text-wf-accent-text hover:border-wf-accent/70 hover:bg-wf-accent-soft",
  };
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  title,
  active,
  disabled,
  size = "md",
  variant = "ghost",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "solid" | "accent";
  className?: string;
}) {
  const sizes = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-8 w-8" };
  const variants = {
    ghost: active
      ? "bg-wf-accent-soft text-wf-accent-text"
      : "text-wf-text-3 hover:bg-wf-raised-2 hover:text-wf-text",
    solid: active
      ? "border border-wf-accent/40 bg-wf-accent-soft text-wf-accent-text"
      : "border border-wf-line bg-wf-raised text-wf-text-3 hover:border-wf-line-warm hover:text-wf-text",
    accent: "bg-wf-accent text-wf-accent-ink hover:bg-wf-accent-hi",
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-grid shrink-0 cursor-pointer place-items-center rounded-wf-md transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 wf-focus ${sizes[size]} ${variants[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  stretch,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "xs" | "sm";
  /** Fill the container and split it evenly between the options. */
  stretch?: boolean;
  className?: string;
}) {
  const pad = size === "xs" ? "h-5 px-1.5 text-wf-sm" : "h-6 px-2 text-wf-md";
  return (
    <div
      className={`${stretch ? "flex w-full" : "inline-flex shrink-0"} gap-0.5 rounded-wf-md border border-wf-line bg-wf-lane p-0.5 ${className ?? ""}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex cursor-pointer items-center justify-center gap-1 rounded-[4px] font-medium transition-colors duration-150 wf-focus ${stretch ? "flex-1" : ""} ${pad} ${
              on ? "bg-wf-accent-soft text-wf-accent-text" : "text-wf-text-3 hover:bg-wf-raised-2 hover:text-wf-text-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
}) {
  return (
    <div role="tablist" className="flex shrink-0 border-b border-wf-line">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            title={o.title}
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-2 text-wf-xs font-semibold uppercase tracking-[0.1em] transition-colors duration-150 wf-focus ${
              on ? "text-wf-accent-text" : "text-wf-text-4 hover:text-wf-text-2"
            }`}
          >
            {o.label}
            {on && <span className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-wf-accent" />}
          </button>
        );
      })}
    </div>
  );
}

export function Card({
  children,
  className,
  onClick,
  accent,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: boolean;
  padded?: boolean;
}) {
  const cls = `rounded-wf-lg border ${accent ? "border-wf-accent/25 bg-wf-accent-soft/40" : "border-wf-line-warm bg-wf-raised"} ${padded ? "p-2.5" : ""} ${className ?? ""}`;
  if (!onClick) return <div className={cls}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} cursor-pointer text-left transition-colors duration-150 hover:border-wf-accent/30 hover:bg-wf-raised-2 wf-focus`}
    >
      {children}
    </button>
  );
}

export function PanelHeader({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-wf-line px-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon && <span className="text-wf-text-3">{icon}</span>}
        <h2 className="truncate text-wf-lg font-semibold text-wf-text">{title}</h2>
      </div>
      {children && <div className="flex shrink-0 items-center gap-0.5">{children}</div>}
    </div>
  );
}

export function GroupHeader({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const content = (
    <>
      {onToggle && (
        <ChevronDown size={12} strokeWidth={2} className={`shrink-0 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
      )}
      <span className="truncate">{title}</span>
      {count !== undefined && <span className="tnum ml-auto shrink-0 text-wf-text-5">{count}</span>}
      {children}
    </>
  );
  if (!onToggle) {
    return <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-3">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-3 transition-colors duration-150 hover:text-wf-text-2 wf-focus"
    >
      {content}
    </button>
  );
}

export function ListRow({
  children,
  onClick,
  active,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const cls = `group flex w-full items-center gap-2 rounded-wf-md px-2 py-1.5 text-left text-wf-md transition-colors duration-150 ${
    active ? "bg-wf-accent-soft text-wf-text" : "text-wf-text-2 hover:bg-wf-raised-2"
  } ${className ?? ""}`;
  if (!onClick) return <div className={cls} title={title}>{children}</div>;
  return (
    <button type="button" title={title} onClick={onClick} className={`${cls} cursor-pointer wf-focus`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border-b border-wf-line-soft px-2.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-3">{title}</h3>
        {right}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function Chip({ children, onRemove, title }: { children: React.ReactNode; onRemove?: () => void; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full items-center gap-1 rounded-wf-sm border border-wf-line bg-wf-raised-2 px-1.5 py-0.5 text-wf-sm text-wf-text-2"
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="-mr-0.5 inline-grid h-3.5 w-3.5 shrink-0 cursor-pointer place-items-center rounded-[3px] text-wf-text-4 transition-colors duration-150 hover:bg-wf-danger/20 hover:text-wf-danger wf-focus"
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "danger" | "ok"; className?: string }) {
  const tones = {
    neutral: "border-wf-line bg-wf-raised-2 text-wf-text-3",
    accent: "border-wf-accent/30 bg-wf-accent-soft text-wf-accent-text",
    warn: "border-wf-warn/30 bg-wf-warn/10 text-wf-warn",
    danger: "border-wf-danger/30 bg-wf-danger/10 text-wf-danger",
    ok: "border-wf-ok/30 bg-wf-ok/10 text-wf-ok",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-wf-sm border px-1.5 py-px text-wf-sm font-medium whitespace-nowrap ${tones[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent"; className?: string }) {
  const tones = {
    neutral: "border-wf-line text-wf-text-3",
    accent: "border-wf-accent/40 text-wf-accent-text",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-wf-xs font-semibold uppercase tracking-[0.1em] whitespace-nowrap ${tones[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-wf-line bg-wf-lane px-1 font-sans text-wf-sm leading-none text-wf-text-4">
      {children}
    </kbd>
  );
}

export function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <span className={`h-4 w-px shrink-0 bg-wf-line ${className ?? ""}`} />
  ) : (
    <span className={`my-1 block h-px w-full bg-wf-line-soft ${className ?? ""}`} />
  );
}

export function StatusDot({ tone = "neutral", pulse }: { tone?: "ok" | "warn" | "danger" | "neutral"; pulse?: boolean }) {
  const tones = { ok: "bg-wf-ok", warn: "bg-wf-warn", danger: "bg-wf-danger", neutral: "bg-wf-text-4" };
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tones[tone]} ${pulse ? "animate-pulse" : ""}`} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  kbd,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  kbd?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-wf-text-4" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-7 ${value ? "pr-7" : kbd ? "pr-10" : "pr-2"}`}
      />
      {value ? (
        <button
          type="button"
          title="Clear"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded-[3px] p-0.5 text-wf-text-4 transition-colors duration-150 hover:text-wf-text wf-focus"
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : (
        kbd && <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2"><Kbd>{kbd}</Kbd></span>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, hint, children }: { icon?: React.ReactNode; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="grid h-9 w-9 place-items-center rounded-wf-lg border border-wf-line bg-wf-raised text-wf-text-4">{icon}</div>}
      <p className="text-wf-md font-medium text-wf-text-2">{title}</p>
      {hint && <p className="max-w-[26ch] text-wf-base leading-relaxed text-wf-text-4">{hint}</p>}
      {children}
    </div>
  );
}

/* --- Menu -----------------------------------------------------------------
   Click-to-open dropdown used by the menubar and small overflow menus.
   Closes on outside pointerdown, Escape, or after an item fires.
-------------------------------------------------------------------------- */

export function Menu({
  label,
  children,
  align = "left",
  width = 208,
  trigger,
}: {
  label?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "left" | "right";
  width?: number;
  trigger?: (p: { open: boolean; toggle: () => void }) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);
  const toggle = () => setOpen((v) => !v);

  return (
    <div ref={ref} className="relative">
      {trigger ? (
        trigger({ open, toggle })
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`h-full cursor-pointer rounded-wf-sm px-2 text-wf-md transition-colors duration-150 wf-focus ${
            open ? "bg-wf-raised-2 text-wf-text" : "text-wf-text-3 hover:bg-wf-raised-2 hover:text-wf-text"
          }`}
        >
          {label}
        </button>
      )}
      {open && (
        <div
          role="menu"
          style={{ width }}
          className={`absolute top-[calc(100%+4px)] z-50 flex flex-col gap-px rounded-wf-lg border border-wf-line bg-wf-raised p-1 shadow-2xl shadow-black/60 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          onClick={close}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  shortcut,
  icon,
  disabled,
  danger,
  checked,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  shortcut?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-wf-sm px-2 py-1.5 text-left text-wf-md transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 wf-focus ${
        danger ? "text-wf-danger hover:bg-wf-danger/15" : "text-wf-text-2 hover:bg-wf-raised-2 hover:text-wf-text"
      }`}
    >
      <span className="grid w-3.5 shrink-0 place-items-center text-wf-text-4">
        {checked ? <Check size={12} strokeWidth={2.5} className="text-wf-accent-text" /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="tnum shrink-0 text-wf-sm text-wf-text-5">{shortcut}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-5">{children}</div>;
}

export function MenuSeparator() {
  return <span className="my-1 block h-px bg-wf-line-soft" />;
}
