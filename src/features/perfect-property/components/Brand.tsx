export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 max-sm:gap-2.5" aria-label="Perfect Property">
      <svg viewBox="0 0 64 64" className={compact ? 'h-8 w-8' : 'h-10 w-10'} aria-hidden="true">
        <defs><filter id="window-softness" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.15" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <path fill="currentColor" d="M32 8 60 33v21l-9-8v-9L32 20 13 37v9l-9 8V33L32 8Z" />
        <g fill="var(--pp-gold)" filter="url(#window-softness)"><rect x="22" y="37" width="8" height="8"/><rect x="34" y="37" width="8" height="8"/><rect x="22" y="49" width="8" height="8"/><rect x="34" y="49" width="8" height="8"/></g>
      </svg>
      {!compact && (
        <span className="whitespace-nowrap text-lg font-semibold leading-none tracking-widest max-sm:text-sm max-sm:tracking-widest">
          PERFECT PROPERTY
        </span>
      )}
    </div>
  )
}

