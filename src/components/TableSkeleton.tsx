/**
 * Skeleton rows matching a table layout — replaces the generic "Loading..."
 * text in app route tables. Renders <tr> rows only, so it must be placed
 * inside the table's own <tbody>.
 */
export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border" aria-hidden="true">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="skeleton h-4 rounded-sm"
                style={{
                  width: `${30 + ((i * 7 + j * 13) % 50)}%`,
                  animationDelay: `${i * 60 + j * 30}ms`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
