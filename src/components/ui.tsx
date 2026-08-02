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