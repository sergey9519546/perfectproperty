import { ArrowRight, Buildings, ChartLineUp, CheckCircle, Database, House, ShieldCheck, Warning } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { WorkspaceParcel } from '../live'
import { formatMoney, parcelTier, underwriteGuidance } from '../live'
import { formatShortDate } from '../data'
import { pct } from '@/lib/format'

export function EvidencePanel({
  parcel,
  onUnderwrite,
  isSubmitting = false,
  onOpenFullDossier,
}: {
  parcel: WorkspaceParcel | null
  onUnderwrite: () => void
  isSubmitting?: boolean
  onOpenFullDossier?: (parcelId: string) => void
}) {
  if (!parcel) {
    return (
      <aside className="evidence-panel grid place-items-center border-l border-pp-border/18 bg-pp-surface p-8 text-center text-sm text-pp-faint">
        Select a parcel to inspect underwriting evidence.
      </aside>
    )
  }

  const tier = parcelTier(parcel.score)
  const metrics = [
    {
      label: 'Modeled offer',
      value: formatMoney(parcel.offer),
      detail: 'Acquisition price',
      icon: House,
      tone: 'text-pp-text',
    },
    {
      label: 'Expected profit',
      value: formatMoney(parcel.profit),
      detail: 'Gross modeled',
      icon: ChartLineUp,
      tone: 'text-profit-strong',
    },
    {
      label: 'Loss risk',
      value: pct(parcel.lossRisk),
      detail: 'MC P(loss)',
      icon: Warning,
      tone: parcel.lossRisk > 0.25 ? 'text-pp-gold' : 'text-pp-text',
    },
    {
      label: 'Deal odds',
      value: pct(parcel.dealOdds),
      detail: 'Accept probability',
      icon: ShieldCheck,
      tone: 'text-pp-text',
    },
  ]

  return (
    <aside className="evidence-panel min-h-0 overflow-y-auto border-l border-pp-border/18 bg-[linear-gradient(180deg,var(--pp-surface-soft),var(--pp-header))] shadow-xs">
      <AnimatePresence mode="wait">
        <motion.div
          key={parcel.id}
          initial={false}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        >
          <div className="border-b border-pp-border/18 bg-pp-surface-raised/80 p-5 shadow-xs">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[.14em] text-pp-faint">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pp-live" />
              Live underwriting
            </div>
            <h2 className="text-xl font-medium tracking-tight text-pp-text">{parcel.address}</h2>
            <p className="mt-1 text-sm text-pp-muted">
              {parcel.marketLabel}
              {parcel.zip ? ` ${parcel.zip}` : ''} · {parcel.ringLabel}
            </p>
            <p className="mt-2 text-xs text-pp-faint">
              {[
                parcel.bedrooms != null || parcel.bathrooms != null
                  ? `${parcel.bedrooms ?? '—'}bd / ${parcel.bathrooms ?? '—'}ba`
                  : null,
                parcel.livingSqft != null ? `${parcel.livingSqft.toLocaleString()} sqft` : null,
                parcel.yearBuilt != null ? `Built ${parcel.yearBuilt}` : null,
                parcel.absentee ? 'Absentee owner' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Physical inputs from live parcel record'}
            </p>
          </div>

          <section className="border-b border-pp-border/18 p-5">
            <p className="label">Perfect score</p>
            <div className="mt-3">
              <div className="font-mono text-5xl leading-none tracking-[-.06em] text-pp-gold">
                {parcel.score.toFixed(1)}
              </div>
              <p className="mt-2 text-sm text-pp-text" title={tier.hint}>
                {tier.label}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="border border-pp-border/18 bg-pp-surface-soft px-2 py-1 text-pp-muted">
                  Scope · {parcel.scope}
                </span>
                <span className="border border-pp-border/18 bg-pp-surface-soft px-2 py-1 text-pp-muted">
                  Exit · {parcel.exitDays ? `${Math.round(parcel.exitDays)}d` : '—'}
                </span>
                {parcel.confidenceGrade && (
                  <span className="border border-pp-border/18 bg-pp-surface-soft px-2 py-1 text-pp-muted">
                    Grade · {parcel.confidenceGrade}
                  </span>
                )}
              </div>
            </div>
            {parcel.computedAt && (
              <div className="mt-4 flex items-center justify-between border-t border-pp-border/12 pt-3 text-xs text-pp-faint">
                <span>Underwritten</span>
                <time dateTime={parcel.computedAt} className="font-mono text-pp-muted">
                  {formatShortDate(parcel.computedAt)}
                </time>
              </div>
            )}
          </section>

          <section className="divide-y divide-pp-border/12 border-b border-pp-border/18 px-5">
            {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
              <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2 py-3" key={label}>
                <Icon size={18} className="text-pp-muted" />
                <span>
                  <span className="block text-sm text-pp-text">{label}</span>
                  <span className="block text-xs text-pp-faint">{detail}</span>
                </span>
                <span className={`font-mono text-sm ${tone}`}>{value}</span>
              </div>
            ))}
          </section>

          <section className="border-b border-pp-border/18 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Database size={17} className="text-pp-muted" />
              <h3 className="text-sm font-medium">Evidence sources</h3>
            </div>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-xs text-pp-muted">
              <dt>Pipeline</dt>
              <dd>LIVE parcel_scores</dd>
              <dt>Property</dt>
              <dd>County / Realie genome</dd>
              <dt>Triggers</dt>
              <dd>Distress · listings (180d gate)</dd>
              <dt>County</dt>
              <dd className="font-mono">{parcel.countyFips ?? '—'}</dd>
            </dl>
            {onOpenFullDossier && (
              <button
                type="button"
                className="mt-4 text-xs text-pp-gold hover:text-pp-gold-bright"
                onClick={() => onOpenFullDossier(parcel.id)}
              >
                Open full dossier
              </button>
            )}
          </section>

          <section className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle size={18} className="text-pp-live" />
              <h3 className="text-sm font-medium">Underwriting action</h3>
            </div>
            <p className="text-xs leading-5 text-pp-muted">
              {underwriteGuidance(parcel.score, parcel.ring)}
            </p>
            <motion.button
              whileTap={isSubmitting ? undefined : { y: 1, scale: 0.99 }}
              className="primary-button mt-4 w-full justify-between disabled:cursor-wait disabled:opacity-60"
              onClick={onUnderwrite}
              type="button"
              disabled={isSubmitting}
            >
              <span className="flex items-center gap-2">
                <Buildings size={17} />
                {isSubmitting ? 'Recording…' : 'Record underwrite'}
              </span>
              <ArrowRight size={17} />
            </motion.button>
          </section>
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}