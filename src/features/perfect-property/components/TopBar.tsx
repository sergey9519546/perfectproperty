import { Buildings, DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Brand } from './Brand'
import { useIsMac } from '@/hooks/use-is-mac'
import { coverageLabel } from '../data'

type Props = {
  onOpenPalette: () => void
  onExport: () => void
  onHome: () => void
  onAccount: () => void
  exporting?: boolean
  organizationName: string
  userInitials: string
  coverage?: string
}

export function TopBar({
  onOpenPalette,
  onExport,
  onHome,
  onAccount,
  exporting = false,
  organizationName,
  userInitials,
  coverage = coverageLabel(),
}: Props) {
  const isMac = useIsMac()
  return (
    <header className="topbar grid h-[72px] grid-cols-[250px_minmax(300px,1fr)_auto] items-center gap-5 border-b border-pp-border/18 bg-pp-header/98 px-5 shadow-inset-border max-md:h-[68px] max-md:grid-cols-[1fr_auto] max-md:gap-2 max-md:px-3">
      <button type="button" onClick={onHome} className="justify-self-start" aria-label="Return to homepage">
        <Brand />
      </button>
      <div className="flex min-w-0 items-center gap-3 max-md:hidden">
        <div className="control-button w-[190px] justify-start" role="status" aria-label={`Organization: ${organizationName}`}>
          <span className="flex min-w-0 items-center gap-2">
            <Buildings size={17} weight="regular" />
            <span className="truncate">{organizationName}</span>
          </span>
        </div>
        <button className="control-button min-w-0 flex-1 justify-start text-pp-faint" onClick={onOpenPalette} type="button">
          <MagnifyingGlass size={17} />
          <span className="truncate">Search markets, assets, owners, or deals…</span>
          <kbd className="ml-auto border border-white/10 bg-white/[.03] px-1.5 py-0.5 font-mono text-xs">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>
      <div className="flex items-center justify-end gap-2">
        <div className="mr-2 hidden items-center gap-2 text-xs text-pp-muted min-[1280px]:flex">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pp-live" />
          Coverage · {coverage}
        </div>
        <motion.button
          whileTap={exporting ? undefined : { y: 1, scale: 0.98 }}
          className="primary-button max-sm:px-3 disabled:cursor-wait disabled:opacity-60"
          onClick={onExport}
          type="button"
          aria-label="Export brief"
          disabled={exporting}
        >
          <DownloadSimple size={17} />
          <span className="max-sm:hidden">{exporting ? 'Exporting…' : 'Export brief'}</span>
        </motion.button>
        <button
          className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-xs font-medium"
          type="button"
          onClick={onAccount}
          aria-label="Account"
        >
          {userInitials}
        </button>
      </div>
    </header>
  )
}