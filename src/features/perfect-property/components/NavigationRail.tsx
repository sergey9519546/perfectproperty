import { Buildings, ChartLineUp, Crosshair, MapTrifold, Rows, Stack } from '@phosphor-icons/react'
import { motion } from 'motion/react'

const items = [
  { id: 'map', label: 'Market map', icon: MapTrifold },
  { id: 'deals', label: 'Deals', icon: Rows },
  { id: 'assets', label: 'Assets', icon: Buildings },
  { id: 'models', label: 'Model accuracy', icon: ChartLineUp },
  { id: 'targets', label: 'Targets', icon: Crosshair },
  { id: 'sources', label: 'Data sources', icon: Stack },
]

export function NavigationRail({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <nav
      className="nav-rail flex w-16 flex-col items-center border-r border-pp-border/18 bg-pp-header py-3 shadow-inset-sidebar max-md:h-14 max-md:w-full max-md:flex-row max-md:justify-center max-md:border-r-0 max-md:border-b max-md:py-0"
      aria-label="Product navigation"
    >
      <div className="flex flex-col gap-1.5 max-md:flex-row">
        {items.map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            whileHover={{ x: active === id ? 0 : 2 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={() => onChange(id)}
            type="button"
            aria-label={label}
            title={label}
            className={`relative grid h-10 w-10 place-items-center rounded-[4px] transition-colors ${
              active === id
                ? 'border border-pp-gold/20 bg-pp-gold/12 text-pp-gold shadow-inset-gold'
                : 'text-pp-faint hover:bg-pp-border/[.07] hover:text-pp-muted'
            }`}
          >
            {active === id && (
              <motion.span
                layoutId="rail-active"
                className="absolute -left-3 h-5 w-[2px] bg-pp-gold max-md:-bottom-2 max-md:left-auto max-md:h-[2px] max-md:w-5"
              />
            )}
            <Icon size={20} weight="regular" />
          </motion.button>
        ))}
      </div>
    </nav>
  )
}