import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css } from "../css";
import { ACCENT } from "../data";

/** Small caps section label used throughout the app. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260);"), ...style }}>
      {children}
    </div>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div style={css("font-size:13px; font-weight:600; margin-bottom:8px;")}>
      {children}
      {hint && <span style={css("font-weight:400; color:oklch(0.55 0.015 260);")}> {hint}</span>}
    </div>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url" | "date" | "datetime-local" | "number";
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  invalid,
  disabled,
  autoFocus,
  onEnter,
  style,
  ariaLabel,
}: TextInputProps) {
  return (
    <input
      className={invalid ? "field field-invalid" : "field"}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnter
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }
          : undefined
      }
      style={style}
    />
  );
}

interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
  /**
   * Enter without Shift submits (chat). Shift+Enter keeps the default newline.
   * Omit for free-form notes where Enter should only insert a line break.
   */
  onEnter?: () => void;
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  invalid,
  disabled,
  autoFocus,
  style,
  ariaLabel,
  onEnter,
}: TextAreaProps) {
  return (
    <textarea
      className={invalid ? "field field-invalid" : "field"}
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnter
          ? (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onEnter();
              }
            }
          : undefined
      }
      style={style}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  style,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <select
      className="field"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
      style={{ cursor: "pointer", ...style }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Search-as-you-type picker. Typing filters `options`; picking sets the value
 * and id. Clearing or typing something that matches nothing keeps the text as
 * a custom value (id null) when `allowCustom` is true.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
  autoFocus,
  emptyHint = "No matches — keep typing for a custom value",
}: {
  value: { id: string | null; label: string };
  onChange: (next: { id: string | null; label: string }) => void;
  options: readonly { id: string; label: string; hint?: string }[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        className="field"
        value={value.label}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        onChange={(e) => {
          onChange({ id: null, label: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div
          role="listbox"
          style={css(
            "position:absolute; left:0; right:0; top:calc(100% + 4px); z-index:20; max-height:220px; overflow-y:auto; background:#fff; border:1px solid oklch(0.88 0.006 260); border-radius:10px; box-shadow:0 12px 32px -16px oklch(0.2 0.04 260 / 0.45);",
          )}
        >
          {options.length === 0 ? (
            <div style={css("padding:10px 12px; font-size:12.5px; color:oklch(0.5 0.015 260);")}>
              {emptyHint}
            </div>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={value.id === o.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: o.id, label: o.label });
                  setOpen(false);
                }}
                style={css(
                  "display:block; width:100%; text-align:left; padding:9px 12px; border:none; background:transparent; cursor:pointer; font-family:'IBM Plex Sans'; font-size:13.5px;",
                )}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "oklch(0.96 0.01 260)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                {o.label}
                {o.hint ? (
                  <span style={css("margin-left:8px; font-size:11.5px; color:oklch(0.55 0.015 260);")}>
                    {o.hint}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Toggle({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="pressable"
      style={{
        ...css("width:38px; height:22px; border-radius:100px; display:flex; align-items:center; padding:2px; cursor:pointer; border:none; transition:all .15s;"),
        background: on ? ACCENT : "oklch(0.85 0.006 260)",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <span style={css("width:18px; height:18px; border-radius:50%; background:#fff; display:block;")}></span>
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  style,
  tour,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  tour?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tour={tour}
      className="pressable"
      style={{
        ...css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:10px 15px; border-radius:9px; cursor:pointer; white-space:nowrap;"),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable"
      style={{
        ...css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.9 0.006 260); padding:9px 14px; border-radius:9px; cursor:pointer; white-space:nowrap;"),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        ...css("border-radius:50%; animation:spin .8s linear infinite; border-style:solid; border-color:oklch(0.55 0.15 255 / 0.3); border-top-color:oklch(0.55 0.15 255);"),
        width: `${size}px`,
        height: `${size}px`,
        borderWidth: `${Math.max(2, Math.round(size / 9))}px`,
      }}
    ></div>
  );
}

/** "48s", "1m 12s" — short enough to sit in a bar's caption. */
function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Keep counting between heartbeats.
 *
 * The server says how long a step has been running every few seconds, and a
 * caption that jumps six seconds at a time reads as broken. So the last report is
 * used as an anchor and the local clock fills the gaps — which measures real
 * elapsed time rather than guessing at progress, and resets to the server's
 * number every time one arrives.
 */
function useElapsed(reportedMs: number | undefined): number {
  const anchor = useRef({ at: 0, ms: 0 });
  const [, tick] = useState(0);

  if (reportedMs !== undefined && reportedMs !== anchor.current.ms) {
    anchor.current = { at: Date.now(), ms: reportedMs };
  }

  useEffect(() => {
    if (reportedMs === undefined) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [reportedMs === undefined]);

  if (reportedMs === undefined) return 0;
  return anchor.current.ms + (Date.now() - anchor.current.at);
}

/**
 * A determinate bar for work that reports real milestones.
 *
 * `step` and `total` come from the thing doing the work, so this never animates
 * on its own: if the bar is still, nothing is happening, and that is information
 * rather than a glitch. Anything that can't report its progress gets a
 * `Spinner`, which promises nothing, instead of a bar that invents a number.
 *
 * `waiting` is the honest middle ground, for a step that is genuinely running
 * with nothing observable inside it. The solid fill stays where the work actually
 * is; a paler fill creeps toward the next step in proportion to elapsed against
 * typical, stops dead at that boundary, and is captioned in seconds so it reads
 * as a clock rather than as a claim about progress.
 */
export function ProgressBar({
  step,
  total,
  label,
  note,
  waiting,
}: {
  step: number;
  total: number;
  label: string;
  /** Standing context, e.g. what the wait is for. Not the current step. */
  note?: string;
  waiting?: { elapsedMs: number; expectedMs: number };
}) {
  const pct = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0;
  const nextPct = total > 0 ? Math.min(100, Math.round(((step + 1) / total) * 100)) : 0;

  const elapsedMs = useElapsed(waiting?.elapsedMs);
  const share = waiting && waiting.expectedMs > 0
    ? Math.min(1, elapsedMs / waiting.expectedMs)
    : 0;
  const ghostPct = waiting ? pct + (nextPct - pct) * share : pct;
  const overrun = waiting ? elapsedMs > waiting.expectedMs : false;

  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuetext={waiting ? `${label}, ${duration(elapsedMs)} so far` : label}
      style={css("width:100%; max-width:420px; margin:0 auto;")}
    >
      <div style={css("display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:8px;")}>
        <span style={css("font-size:13px; font-weight:600; text-align:left;")}>{label}</span>
        <span style={css("font-family:'IBM Plex Mono'; font-size:11.5px; color:oklch(0.55 0.015 260); flex-shrink:0;")}>
          {waiting ? duration(elapsedMs) : `${pct}%`}
        </span>
      </div>

      <div style={css("position:relative; height:6px; border-radius:100px; background:oklch(0.92 0.006 260); overflow:hidden;")}>
        <div
          style={{
            ...css("position:absolute; inset:0 auto 0 0; height:100%; border-radius:100px; background:oklch(0.55 0.15 255 / 0.28); transition:width 1s linear;"),
            width: `${ghostPct}%`,
          }}
        ></div>
        <div
          style={{
            ...css("position:absolute; inset:0 auto 0 0; height:100%; border-radius:100px; background:oklch(0.55 0.15 255); transition:width .35s ease;"),
            width: `${pct}%`,
          }}
        ></div>
      </div>

      <div style={css("display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-top:8px;")}>
        <span style={css("font-size:12px; color:oklch(0.5 0.015 260); line-height:1.5; text-align:left;")}>
          {waiting
            ? overrun
              ? `Longer than the usual ${duration(waiting.expectedMs)}. It is still running — nothing has failed.`
              : `Usually about ${duration(waiting.expectedMs)}.`
            : note}
        </span>
        <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.6 0.015 260); flex-shrink:0; margin-left:auto;")}>
          step {Math.min(step, total)} of {total}
        </span>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={css("display:flex; flex-direction:column; align-items:center; gap:14px; padding:60px 20px; color:oklch(0.5 0.015 260); font-size:13.5px;")}>
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div style={css("border:1px solid oklch(0.6 0.16 25 / 0.3); background:oklch(0.6 0.16 25 / 0.05); border-radius:11px; padding:14px 16px; display:flex; align-items:center; gap:12px;")}>
      <div style={css("font-size:13px; color:oklch(0.45 0.12 25); line-height:1.5;")}>{message}</div>
      {retry && <SecondaryButton onClick={retry} style={{ marginLeft: "auto" }}>Retry</SecondaryButton>}
    </div>
  );
}

/** Honest empty state: says what's missing and offers the one action that fixes it. */
export function EmptyState({
  title,
  body,
  action,
  compact,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...css("border:1px dashed oklch(0.85 0.008 260); border-radius:13px; background:#fff; text-align:center;"),
        padding: compact ? "24px 20px" : "44px 28px",
      }}
    >
      <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:6px;")}>{title}</div>
      <p style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.55; margin:0 auto; max-width:420px;")}>{body}</p>
      {action && <div style={css("margin-top:18px; display:flex; justify-content:center; gap:10px;")}>{action}</div>}
    </div>
  );
}