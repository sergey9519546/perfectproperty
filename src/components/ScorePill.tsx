import { tierLabel } from "@/lib/format";

/**
 * Premium tier-colored score pill — mirrors the workspace's EvidencePanel
 * treatment: font-mono score, tier-tinted background, subtle label.
 * Replaces the bare colored-text scores in app route tables.
 */
export function ScorePill({
  score,
  size = "md",
}: {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null || isNaN(Number(score))) {
    return <span className="num text-muted-foreground">—</span>;
  }
  const t = tierLabel(Number(score));
  const dims =
    size === "lg"
      ? { num: "text-2xl", label: "text-[10px]", pad: "px-3 py-2" }
      : size === "sm"
        ? { num: "text-sm", label: "text-[8px]", pad: "px-1.5 py-1" }
        : { num: "text-lg", label: "text-[9px]", pad: "px-2.5 py-1.5" };

  return (
    <div className="inline-flex flex-col items-center">
      <span
        className={`num ${dims.num} font-bold leading-none tracking-tight`}
        style={{ color: t.color }}
        title={t.hint}
      >
        {Math.round(Number(score))}
      </span>
      <span
        className={`${dims.label} mt-1 font-medium uppercase tracking-wider`}
        style={{ color: t.color, opacity: 0.7 }}
      >
        {t.label}
      </span>
    </div>
  );
}