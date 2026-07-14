import { ArrowRight, BookmarkSimple, Buildings, ChartLineUp, CheckCircle, Database, Drop, ShieldCheck, Stack } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { Market } from '../data'

export function EvidencePanel({ market, onUnderwrite, isSubmitting = false }: { market: Market | null; onUnderwrite: () => void; isSubmitting?: boolean }) {
  if (!market) return <aside className="evidence-panel grid place-items-center border-l border-[#7893a5]/18 bg-[#061018] p-8 text-center text-sm text-[#7e909b]">Select a market to inspect its underwriting evidence.</aside>
  const metrics = [
    { label: 'Rent durability', value: market.rent, sentiment: 'High', delta: '+0.18', icon: ChartLineUp, positive: true },
    { label: 'Supply pressure', value: market.supply, sentiment: market.supply > 80 ? 'Low' : 'Moderate', delta: '-0.24', icon: Stack, positive: false },
    { label: 'Liquidity', value: market.liquidity, sentiment: 'High', delta: '+0.31', icon: Drop, positive: true },
    { label: 'Insurance exposure', value: market.insurance, sentiment: market.insurance > 60 ? 'Elevated' : 'Moderate', delta: '-0.07', icon: ShieldCheck, positive: false },
  ]
  return (
    <aside className="evidence-panel min-h-0 overflow-y-auto border-l border-[#7893a5]/18 bg-[linear-gradient(180deg,#07131b,#040c12)] shadow-[inset_1px_0_0_rgba(255,255,255,.012)]">
      <AnimatePresence mode="wait">
        <motion.div key={market.id} initial={false} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ type: 'spring', stiffness: 160, damping: 24 }}>
          <div className="border-b border-[#7893a5]/16 bg-[#081620]/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.018)]">
            <div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#718592]"><i className="h-1.5 w-1.5 rounded-full bg-[#05d680]"/>Market intelligence</div><h2 className="text-[20px] font-medium tracking-[-.02em] text-[#f4f7f8]">{market.name}, {market.state}</h2><p className="mt-1 text-[12px] text-[#8798a3]">{market.strategy} · {market.type}</p></div><button className="icon-button" aria-label="Save market" type="button"><BookmarkSimple size={18}/></button></div>
          </div>
          <section className="border-b border-[#7893a5]/16 p-5">
            <p className="label">Opportunity score</p>
            <div className="mt-3 grid grid-cols-[1fr_150px] gap-4"><div><div className="font-mono text-[52px] leading-none tracking-[-.06em] text-[#efaa2d]">{market.score.toFixed(1)}</div><p className="mt-2 text-[12px] text-[#d0d9de]">Excellent</p><div className="mt-3 inline-flex items-center gap-1 border border-[#05d680]/25 bg-[#05d680]/[.075] px-2 py-1 font-mono text-[10px] text-[#65e4a1]">↑ {market.change.toFixed(1)} vs 30d ago</div></div><Distribution score={market.score}/></div>
            <div className="mt-4 flex items-center justify-between border-t border-[#7893a5]/12 pt-3 text-[11px] text-[#7e909b]"><span>Confidence interval</span><span className="font-mono text-[#c2cdd3]">90% · {market.confidence[0]}—{market.confidence[1]}</span></div>
          </section>
          <section className="divide-y divide-[#7893a5]/[.11] border-b border-[#7893a5]/16 px-5">{metrics.map(({label,value,sentiment,delta,icon:Icon,positive}) => <div className="grid grid-cols-[24px_1fr_66px_58px] items-center gap-2 py-3" key={label}><Icon size={18} className="text-[#8296a3]"/><span className="text-[12px] text-[#dbe3e7]">{label}</span><Sparkline value={value} positive={positive}/><span className={`text-right font-mono text-[10px] ${positive ? 'text-[#52d88e]' : 'text-[#efaa2d]'}`}>{sentiment}<small className="mt-1 block opacity-70">{delta}</small></span></div>)}</section>
          <section className="border-b border-[#7893a5]/16 p-5"><div className="mb-4 flex items-center gap-2"><Database size={17} className="text-[#8296a3]"/><h3 className="text-[13px] font-medium">Source lineage</h3></div><dl className="grid grid-cols-[90px_1fr] gap-y-2 text-[11px] text-[#8798a3]"><dt>Rent data</dt><dd>CoStar, Apr 2024</dd><dt>Supply data</dt><dd>Yardi Matrix, Apr 2024</dd><dt>Sales data</dt><dd>RCA, Mar 2024</dd><dt>Insurance</dt><dd>CoreLogic, May 2024</dd></dl><button className="mt-4 text-[11px] text-[#efaa2d] hover:text-[#ffc758]" type="button">View all sources</button></section>
          <section className="p-5"><div className="mb-3 flex items-center gap-2"><CheckCircle size={18} className="text-[#05d680]"/><h3 className="text-[13px] font-medium">Underwriting action</h3></div><p className="text-[11px] leading-5 text-[#8798a3]">Market rated excellent. Prioritize rent-roll validation and insurance diligence before committee review.</p><motion.button whileTap={isSubmitting ? undefined : { y: 1, scale: .99 }} className="primary-button mt-4 w-full justify-between disabled:cursor-wait disabled:opacity-60" onClick={onUnderwrite} type="button" disabled={isSubmitting}><span className="flex items-center gap-2"><Buildings size={17}/>{isSubmitting ? 'Creating…' : 'Create underwrite'}</span><ArrowRight size={17}/></motion.button></section>
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}

function Distribution({ score }: { score: number }) { return <div className="relative flex h-[76px] items-end gap-[2px] border-b border-[#7893a5]/22 pb-0">{Array.from({length:24},(_,i)=>{const h=10+Math.sin((i/23)*Math.PI)*52; const active=Math.abs(i-15)<3; return <i key={i} className={active?'bg-[#efaa2d]':'bg-[#607482]'} style={{height:h,width:3}}/>})}<span className="absolute right-0 top-0 font-mono text-[9px] text-[#efaa2d]">{score.toFixed(1)}</span></div> }
function Sparkline({ value, positive }: { value: number; positive: boolean }) { const amplitude=Math.max(2,value/12); const points=[2,8,6,11,9,14,12,16].map((y,i)=>`${i*9},${positive?22-Math.min(18,y*amplitude/6):Math.min(21,y*amplitude/6)}`).join(' '); return <svg viewBox="0 0 65 24" className="h-6 w-[66px]" aria-hidden="true"><polyline points={points} fill="none" stroke={positive?'#42cf82':'#efaa2d'} strokeWidth="1.4"/><circle cx="63" cy={positive?4:16} r="2" fill={positive?'#42cf82':'#efaa2d'}/></svg> }
