/** The PrepFor.Me mark — a target/aperture glyph. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <rect x="0" y="0" width="24" height="24" rx="7" style={{ fill: "oklch(0.55 0.15 255)" }} />
      <circle cx="12" cy="12" r="6.3" fill="none" stroke="#fff" strokeWidth="2.1" strokeOpacity="0.92" />
      <circle cx="12" cy="12" r="2.3" fill="#fff" />
    </svg>
  );
}
