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

export function tierLabel(score: number): { label: string; color: string; hint: string } {
  if (score >= 80) return { label: "Great buy", color: "var(--tier-exceptional)", hint: "Top-tier opportunity (score 80+)" };
  if (score >= 65) return { label: "Strong", color: "var(--tier-strong)", hint: "Solid deal (score 65–79)" };
  if (score >= 50) return { label: "Worth a look", color: "var(--tier-viable)", hint: "Viable, run the numbers (score 50–64)" };
  return { label: "Skip / watch", color: "var(--tier-watch)", hint: "Below our buy bar right now (score under 50)" };
}

export function ringLabel(ring: number): string {
  return ring === 3 ? "Predicted to list" : ring === 2 ? "Off-market" : "On the market";
}
