export function fmt$(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${v < 0 ? "-" : ""}$${abs.toFixed(0)}`;
}

export function pct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

export function tierLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Exceptional", color: "var(--tier-exceptional)" };
  if (score >= 65) return { label: "Strong", color: "var(--tier-strong)" };
  if (score >= 50) return { label: "Viable", color: "var(--tier-viable)" };
  return { label: "Watch", color: "var(--tier-watch)" };
}

export function ringLabel(ring: number): string {
  return ring === 3 ? "Prophecy" : ring === 2 ? "Shadow" : "Open Market";
}
