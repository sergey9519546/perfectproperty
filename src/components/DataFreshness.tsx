/**
 * Text-mode timestamp — shows how recently a piece of data was refreshed.
 * Renders "just now", "12m ago", "3h ago", "2d ago", or an ISO fallback.
 */
interface Props {
  timestamp?: string | Date | null;
  prefix?: string;
  className?: string;
}

function relative(from: Date): string {
  const s = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function DataFreshness({ timestamp, prefix = "Updated", className = "" }: Props) {
  if (!timestamp) return null;
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(d.getTime())) return null;
  return (
    <span
      suppressHydrationWarning
      title={d.toISOString()}
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground ${className}`}
    >
      <span className="h-1 w-1 rounded-full bg-profit-strong/70" />
      {prefix} {relative(d)}
    </span>
  );
}
