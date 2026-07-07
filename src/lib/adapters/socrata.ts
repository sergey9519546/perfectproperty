/**
 * Socrata Open Data query (DataSF, NYC OpenData, etc.).
 * No key required for reasonable volumes.
 */
export async function socrataQuery(baseUrl: string, opts: { limit?: number; offset?: number; where?: string } = {}) {
  const params = new URLSearchParams({
    $limit: String(opts.limit ?? 100),
    $offset: String(opts.offset ?? 0),
  });
  if (opts.where) params.set("$where", opts.where);
  const url = `${baseUrl}?${params.toString()}`;
  const res = await fetch(url, { headers: { "user-agent": "PerfectPropertyEngine/1.0" } });
  if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as Record<string, any>[];
}
