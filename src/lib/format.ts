/** Human-facing formatting for timestamps and enum-ish values. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "just now" / "4h ago" / "3d ago" / "2w ago" — the tracker's Updated column. */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = now - then;
  if (diff < 90_000) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.round(diff / DAY)}d ago`;
  return `${Math.round(diff / WEEK)}w ago`;
}

/** "Thursday · Week of Aug 3" — the Home header. */
export function weekHeader(now = new Date()): string {
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const monday = startOfWeek(now);
  const week = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday} · Week of ${week}`;
}

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

export function endOfWeek(date = new Date()): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 7);
  return d;
}

export function isThisWeek(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfWeek(now).getTime() && t < endOfWeek(now).getTime();
}

/** "Fri" for this week, "Mon 12" beyond it — the compact due chip. */
export function dueLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isThisWeek(iso, now)) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

/** "Fri 10am" — used where both day and time matter. */
export function dueLabelWithTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" ", "")
    .toLowerCase();
  return `${day} ${time}`;
}

/** "2021 — Present" from two date columns. */
export function dateRange(start: string | null, end: string | null): string {
  const from = start ? new Date(start).getFullYear() : null;
  const to = end ? new Date(end).getFullYear() : null;
  if (!from && !to) return "";
  if (!to) return `${from} — Present`;
  return `${from} — ${to}`;
}

/** The date input value for a timestamptz column. */
export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Aug 4, 2026" — a date standing on its own, with no time beside it. */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2.4 MB" — file sizes in the units the user's own file picker showed them. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
