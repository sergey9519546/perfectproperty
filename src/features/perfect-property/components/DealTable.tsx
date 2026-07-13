import { DotsThree, MagnifyingGlass, SlidersHorizontal } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { Deal } from '../data'

export function DealTable({ deals, selectedMarket, onSelectMarket }: { deals: Deal[]; selectedMarket: string | null; onSelectMarket: (market: string) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => deals.filter((deal) => `${deal.address} ${deal.market} ${deal.strategy}`.toLowerCase().includes(query.toLowerCase())), [deals, query])
  return (
    <section className="deal-table min-h-0 overflow-hidden border-t border-[#7893a5]/18 bg-[#030b11]">
      <div className="flex h-12 items-center gap-3 border-b border-[#7893a5]/16 bg-[#051019] px-4 max-sm:gap-2 max-sm:px-3"><strong className="flex items-center gap-2 whitespace-nowrap text-[13px] font-medium"><i className="h-1.5 w-1.5 rounded-full bg-[#efaa2d]"/><span className="max-sm:hidden">{filtered.length.toLocaleString()} priority opportunities</span><span className="hidden max-sm:inline">{filtered.length.toLocaleString()} opportunities</span></strong><button className="control-button ml-2 h-8 whitespace-nowrap px-2.5 max-sm:ml-0" type="button"><SlidersHorizontal size={15}/><span className="max-sm:hidden">Edit columns</span><span className="hidden max-sm:inline">Columns</span></button><label className="relative ml-auto max-w-[240px] flex-1"><MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#718491]" size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} className="h-8 w-full rounded-[4px] border border-[#7893a5]/18 bg-[#07131b] pl-8 pr-3 text-[11px] text-[#dce4e9] outline-none placeholder:text-[#60717c] focus:border-[#efaa2d]/60" placeholder="Search table…"/></label></div>
      <div className="overflow-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-[11px]"><thead className="sticky top-0 bg-[#040d14] text-[#738692]"><tr>{['Address','Market','Strategy','Basis','IRR','Score','Updated',''].map((name)=><th className="border-b border-[#7893a5]/16 px-4 py-2 font-normal" key={name}>{name}</th>)}</tr></thead><tbody>{filtered.map((deal)=>{const active=deal.market===selectedMarket; return <motion.tr initial={false} animate={{opacity:1,y:0}} key={deal.id} className={`group border-b border-[#7893a5]/[.10] text-[#afbdc6] transition-colors hover:bg-[#123047]/20 ${active ? 'bg-[#efaa2d]/[.035]' : ''}`}><td className={`border-l-2 px-4 py-2 font-medium text-[#edf3f6] ${active ? 'border-l-[#efaa2d]' : 'border-l-transparent'}`}>{deal.address}</td><td><button onClick={()=>onSelectMarket(deal.market)} type="button" className="px-4 py-2 hover:text-[#efaa2d]">{deal.market}</button></td><td className="px-4 py-2">{deal.strategy}</td><td className="px-4 py-2 font-mono">{deal.basis}</td><td className="px-4 py-2 font-mono text-[#52cf87]">{deal.irr}%</td><td className="px-4 py-2 font-mono text-[#efaa2d]">{deal.score}</td><td className="px-4 py-2">{deal.updated}</td><td className="px-3"><button className="icon-button h-7 w-7" aria-label={`Actions for ${deal.address}`} type="button"><DotsThree size={17}/></button></td></motion.tr>})}</tbody></table>
        {filtered.length===0&&<div className="grid h-32 place-items-center text-center text-sm text-[#78827f]">No deals match this search.</div>}
      </div>
    </section>
  )
}
