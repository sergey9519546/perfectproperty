import { Buildings, ChartLineUp, Crosshair, Gear, MapTrifold, Rows, Stack, UsersThree } from '@phosphor-icons/react'
import { motion } from 'motion/react'

const items = [
  { id: 'map', label: 'Market map', icon: MapTrifold },
  { id: 'deals', label: 'Deals', icon: Rows },
  { id: 'assets', label: 'Assets', icon: Buildings },
  { id: 'models', label: 'Model accuracy', icon: ChartLineUp },
  { id: 'targets', label: 'Targets', icon: Crosshair },
  { id: 'sources', label: 'Data sources', icon: Stack },
  { id: 'team', label: 'Team', icon: UsersThree },
]

export function NavigationRail({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <nav className="nav-rail flex w-16 flex-col items-center border-r border-[#7893a5]/18 bg-[#040c12] py-3 shadow-[inset_-1px_0_0_rgba(255,255,255,.012)] max-md:h-14 max-md:w-full max-md:flex-row max-md:justify-center max-md:border-r-0 max-md:border-b max-md:py-0" aria-label="Product navigation">
      <div className="flex flex-col gap-1.5 max-md:flex-row">
        {items.map(({ id, label, icon: Icon }) => (
          <motion.button key={id} whileHover={{ x: active === id ? 0 : 2 }} whileTap={{ scale: .94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} onClick={() => onChange(id)} type="button" aria-label={label} title={label} className={`relative grid h-10 w-10 place-items-center rounded-[4px] transition-colors ${active === id ? 'border border-[#efaa2d]/20 bg-[#efaa2d]/12 text-[#efaa2d] shadow-[inset_0_1px_0_rgba(255,214,122,.08)]' : 'text-[#71838f] hover:bg-[#6e9ab5]/[.055] hover:text-[#d8e1e7]'}`}>
            {active === id && <motion.span layoutId="rail-active" className="absolute -left-3 h-5 w-[2px] bg-[#efaa2d] max-md:-bottom-2 max-md:left-auto max-md:h-[2px] max-md:w-5"/>}
            <Icon size={20} weight="regular"/>
          </motion.button>
        ))}
      </div>
      <button className="icon-button mt-auto max-md:absolute max-md:right-3" aria-label="Settings" title="Settings" type="button"><Gear size={19}/></button>
    </nav>
  )
}

