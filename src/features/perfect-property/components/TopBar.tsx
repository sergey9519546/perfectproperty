import { Bell, Buildings, CaretDown, DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Brand } from './Brand'

type Props = { onOpenPalette: () => void; onExport: () => void; onHome: () => void; onAccount: () => void }

export function TopBar({ onOpenPalette, onExport, onHome, onAccount }: Props) {
  return (
    <header className="topbar grid h-[72px] grid-cols-[250px_minmax(300px,1fr)_auto] items-center gap-5 border-b border-[#7893a5]/20 bg-[#02080d]/98 px-5 shadow-[inset_0_-1px_0_rgba(255,255,255,.018)] max-md:h-[68px] max-md:grid-cols-[1fr_auto] max-md:gap-2 max-md:px-3">
      <button type="button" onClick={onHome} className="justify-self-start" aria-label="Return to homepage"><Brand /></button>
      <div className="flex min-w-0 items-center gap-3 max-md:hidden">
        <button className="control-button w-[190px] justify-between" type="button">
          <span className="flex items-center gap-2"><Buildings size={17} weight="regular"/>Apex Investments</span><CaretDown size={14}/>
        </button>
        <button className="control-button min-w-0 flex-1 justify-start text-[#7d8786]" onClick={onOpenPalette} type="button">
          <MagnifyingGlass size={17}/><span className="truncate">Search markets, assets, owners, or deals…</span><kbd className="ml-auto border border-white/10 bg-white/[.03] px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </div>
      <div className="flex items-center justify-end gap-2">
        <div className="mr-2 hidden items-center gap-2 text-[10px] text-[#8fa0ac] min-[1280px]:flex"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#05d680]"/>Updated nightly · CA + FL</div>
        <motion.button whileTap={{ y: 1, scale: .98 }} className="primary-button max-sm:px-3" onClick={onExport} type="button" aria-label="Export brief"><DownloadSimple size={17}/><span className="max-sm:hidden">Export brief</span></motion.button>
        <button className="icon-button max-sm:hidden" aria-label="Notifications" type="button"><Bell size={19}/></button>
        <button className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[11px] font-medium" type="button" onClick={onAccount} aria-label="Open account sign in">MT</button>
      </div>
    </header>
  )
}
