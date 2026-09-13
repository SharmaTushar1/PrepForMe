import { type ButtonHTMLAttributes, type CSSProperties } from "react";
import { colors, font } from "./theme";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZE_STYLE: Record<Size, CSSProperties> = {
  sm: { fontSize: 12.5, padding: "6px 12px", borderRadius: 7 },
  md: { fontSize: 13.5, padding: "9px 16px", borderRadius: 8 },
  lg: { fontSize: 14, padding: "11px 16px", borderRadius: 9 },
};

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  primary: { background: colors.primary, color: colors.primaryText, border: "none" },
  outline: { background: "transparent", color: colors.text, border: `1px solid ${colors.border}` },
  ghost: { background: "transparent", color: colors.textMuted, border: "none" },
};

export function Button({
  variant = "primary",
  size = "md",
  full,
  style,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        fontFamily: font,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: full ? "100%" : undefined,
        ...SIZE_STYLE[size],
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    />
  );
}

export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${colors.border}`,
        borderTopColor: colors.primary,
        animation: "pfm-spin 0.8s linear infinite",
        margin: "0 auto",
      }}
    />
  );
}

export function Badge({ tone, children }: { tone: "success" | "warning" | "info"; children: React.ReactNode }) {
  const map = {
    success: { bg: colors.successBg, fg: colors.successText },
    warning: { bg: colors.warningBg, fg: colors.warningText },
    info: { bg: colors.bgMuted, fg: colors.textMuted },
  } as const;
  const tones = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11.5,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        background: tones.bg,
        color: tones.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 56,
        fontFamily: font,
        fontSize: 13,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "9px 11px",
        resize: "vertical",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        height: 34,
        fontFamily: font,
        fontSize: 13,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 7,
        padding: "0 10px",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        display: "block",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.dangerBg,
        color: colors.dangerText,
        border: `1px solid ${colors.danger}`,
        borderRadius: 8,
        padding: "9px 11px",
        fontSize: 12.5,
        lineHeight: 1.5,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
