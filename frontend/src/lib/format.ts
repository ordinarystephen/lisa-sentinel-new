/**
 * Formatting helpers — relative times, file sizes, etc. Pure functions; no
 * UI dependencies.
 */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatRelativeTime(input: string | number | Date): string {
  const then = new Date(input).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (Math.abs(diffSec) < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${diffMin} min ago`;
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return `${diffHour} hr ago`;
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 7) return `${diffDay} day${Math.abs(diffDay) === 1 ? "" : "s"} ago`;
  const date = new Date(then);
  return date.toISOString().slice(0, 10);
}

export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
