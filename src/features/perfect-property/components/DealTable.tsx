import { MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import type { WorkspaceParcel } from '../live'
import { formatMoney } from '../live'
import { formatShortDate } from '../data'
import { pct } from '@/lib/format'

export function DealTable({
  parcels,
  selectedId,
  onSelect,
  loading,
}: {
  parcels: WorkspaceParcel[]
  selectedId: string | null
  onSelect: (parcel: WorkspaceParcel) => void
  loading?: boolean
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () =>
      parcels.filter((p) =>
        `${p.address} ${p.city} ${p.state} ${p.scope} ${p.ringLabel}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [parcels, query],
  )

  return (
    <section className="deal-table min-h-0 overflow-hidden border-t border-pp-border/18 bg-pp-surface">
      <div className="flex h-12 items-center gap-3 border-b border-pp-border/18 bg-pp-surface px-4 max-sm:gap-2 max-sm:px-3">
        <strong className="flex items-center gap-2 whitespace-nowrap text-md font-medium">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pp-gold" />
          <span className="max-sm:hidden">
            {loading ? 'Loading…' : `${filtered.length.toLocaleString()} live scored parcels`}
          </span>
          <span className="hidden max-sm:inline">
            {loading ? '…' : filtered.length.toLocaleString()}
          </span>
        </strong>
        <label className="relative ml-auto max-w-[240px] flex-1">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pp-faint" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-[4px] border border-pp-border/18 bg-pp-surface-soft pl-8 pr-3 text-sm text-pp-text outline-none placeholder:text-pp-faint focus:border-pp-gold/60"
            aria-label="Search parcels"
            placeholder="Search address or market…"
          />
        </label>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-pp-header text-pp-faint">
            <tr>
              {['Address', 'Market', 'Source', 'Offer', 'Profit', 'Score', 'Loss risk', 'Updated'].map((name) => (
                <th scope="col" className="border-b border-pp-border/18 px-4 py-2 font-normal" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((parcel) => {
              const active = parcel.id === selectedId
              return (
                <tr
                  key={parcel.id}
                  className={`group cursor-pointer border-b border-pp-border/12 text-pp-muted transition-colors hover:bg-pp-surface-soft/40 ${active ? 'bg-pp-gold/[.035]' : ''}`}
                  onClick={() => onSelect(parcel)}
                >
                  <td className={`border-l-2 px-4 py-2 font-medium text-pp-text ${active ? 'border-l-pp-gold' : 'border-l-transparent'}`}>
                    {parcel.address}
                  </td>
                  <td className="px-4 py-2">{parcel.marketLabel}</td>
                  <td className="px-4 py-2">{parcel.ringLabel}</td>
                  <td className="px-4 py-2 font-mono">{formatMoney(parcel.offer)}</td>
                  <td className="px-4 py-2 font-mono text-profit-strong">{formatMoney(parcel.profit)}</td>
                  <td className="px-4 py-2 font-mono text-pp-gold">{parcel.score.toFixed(1)}</td>
                  <td className="px-4 py-2 font-mono">{pct(parcel.lossRisk)}</td>
                  <td className="px-4 py-2">
                    {parcel.computedAt ? (
                      <time dateTime={parcel.computedAt}>{formatShortDate(parcel.computedAt)}</time>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="grid h-32 place-items-center text-center text-sm text-pp-faint">
            No parcels match this search or region filter.
          </div>
        )}
        {loading && (
          <div className="space-y-2 p-4" aria-busy="true">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-4/5" />
          </div>
        )}
      </div>
    </section>
  )
}