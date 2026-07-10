/**
 * Socrata Open Data query (DataSF, NYC OpenData, Cook County, etc.).
 * No key required for reasonable volumes. Supports pagination.
 */
export async function socrataQuery(
  baseUrl: string,
  opts: { limit?: number; offset?: number; where?: string } = {},
) {
  const params = new URLSearchParams({
    $limit: String(opts.limit ?? 1000),
    $offset: String(opts.offset ?? 0),
  });
  if (opts.where) params.set("$where", opts.where);
  const url = `${baseUrl}?${params.toString()}`;
  const res = await fetch(url, { headers: { "user-agent": "PerfectPropertyEngine/1.0" } });
  if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as Record<string, any>[];
}

/**
 * Auto-paginate a Socrata endpoint up to `max` rows using $limit / $offset.
 * Chunks at 5000 rows (Socrata comfortably serves this without a token).
 */
export async function socrataQueryAll(
  baseUrl: string,
  opts: { max: number; where?: string; chunk?: number } = { max: 1000 },
) {
  const chunk = opts.chunk ?? 5000;
  const out: Record<string, any>[] = [];
  for (let offset = 0; offset < opts.max; offset += chunk) {
    const batch = await socrataQuery(baseUrl, {
      limit: Math.min(chunk, opts.max - offset),
      offset,
      where: opts.where,
    });
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < chunk) break;
  }
  return out;
}
