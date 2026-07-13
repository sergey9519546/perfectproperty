import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, MagnifyingGlass, MapPin } from '@phosphor-icons/react'
import type { Market } from '../data'

type Props = { open: boolean; markets: Market[]; onClose: () => void; onSelect: (market: Market) => void }

export function CommandPalette({ open, markets, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  const results = useMemo(() => markets.filter((market) =>
    `${market.name} ${market.state} ${market.type}`.toLowerCase().includes(query.toLowerCase()),
  ), [markets, query])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-20 grid place-items-start bg-[#01070c]/80 p-4 pt-[13vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
          <motion.div role="dialog" aria-modal="true" aria-label="Search markets" initial={{ opacity: 0, y: -18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: .99 }} transition={{ type: 'spring', stiffness: 180, damping: 24 }} className="w-full max-w-[620px] overflow-hidden rounded-[7px] border border-[#7893a5]/26 bg-[#07131b] shadow-[0_30px_100px_rgba(0,5,9,.58),inset_0_1px_0_rgba(255,255,255,.055)]">
            <label className="relative block border-b border-[#7893a5]/18">
              <MagnifyingGlass size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#7d909c]"/>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-16 w-full bg-transparent pl-14 pr-14 text-[15px] text-[#edf3f6] outline-none placeholder:text-[#60727e]" placeholder="Search markets or property types…"/>
              <kbd className="absolute right-4 top-1/2 -translate-y-1/2 border border-[#7893a5]/18 px-2 py-1 font-mono text-[10px] text-[#748894]">ESC</kbd>
            </label>
            <div className="max-h-[390px] overflow-y-auto p-2">
              <p className="px-3 py-2 text-[10px] uppercase tracking-[.14em] text-[#677b88]">Calibrated markets</p>
              {results.map((market) => (
                <motion.button layout key={market.id} onClick={() => { onSelect(market); onClose() }} type="button" className="group grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[4px] px-3 py-3 text-left hover:bg-[#789fba]/[.065]">
                  <span className="grid h-8 w-8 place-items-center border border-[#7893a5]/18 text-[#efaa2d]"><MapPin size={17}/></span>
                  <span><strong className="block text-[13px] font-medium">{market.name}, {market.state}</strong><small className="mt-1 block text-[11px] text-[#7f929e]">{market.type} · {market.opportunities} opportunities</small></span>
                  <span className="flex items-center gap-3 font-mono text-[13px] text-[#efaa2d]">{market.score.toFixed(1)}<ArrowRight className="opacity-0 transition-opacity group-hover:opacity-100"/></span>
                </motion.button>
              ))}
              {results.length === 0 && <div className="p-10 text-center text-sm text-[#7f929e]">No calibrated markets found.</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

