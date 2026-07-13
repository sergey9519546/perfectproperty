import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight, Brain, Buildings, ChartLineUp, Database, Gauge,
  Lightning, List, LockKey, MapTrifold, Play, ShieldCheck, Stack, Target,
} from '@phosphor-icons/react'
import { Brand } from './Brand'
import type { MapParcel } from '@/components/MapView'

const LazyMapView = lazy(() => import('@/components/MapView').then((module) => ({ default: module.MapView })))

const features = [
  { title: 'AI-powered models', copy: 'Rank markets with calibrated, explainable signals.', icon: Brain },
  { title: 'Nightly market refresh', copy: 'Track changes across California and Florida.', icon: Stack },
  { title: 'Evidence by default', copy: 'Trace every score to its underlying source.', icon: ShieldCheck },
  { title: 'Underwriting actions', copy: 'Move from signal to investment memo without handoffs.', icon: ChartLineUp },
]

const metrics = [
  { value: '94.2', label: 'Top opportunity score', icon: Target },
  { value: '109', label: 'Calibrated opportunities', icon: ChartLineUp },
  { value: '4', label: 'Validated source families', icon: ShieldCheck },
  { value: 'Nightly', label: 'Market data refresh', icon: Lightning },
]

const personas = [
  { title: 'Investors', detail: 'Institutional & private', icon: Buildings },
  { title: 'Acquisitions', detail: 'Market and deal teams', icon: Target },
  { title: 'Lenders', detail: 'Risk and credit groups', icon: Gauge },
  { title: 'Institutions', detail: 'Family offices & funds', icon: LockKey },
]

const sampleParcels: MapParcel[] = [
  { parcel_id: 'CA-001', lat: 34.0522, lng: -118.2437, perfect_score: 94, ring: 1 },
  { parcel_id: 'CA-002', lat: 33.7490, lng: -117.8723, perfect_score: 88, ring: 2 },
  { parcel_id: 'CA-003', lat: 32.7157, lng: -117.1611, perfect_score: 92, ring: 1 },
  { parcel_id: 'FL-001', lat: 25.7617, lng: -80.1918, perfect_score: 93, ring: 1 },
  { parcel_id: 'FL-002', lat: 27.9506, lng: -82.4572, perfect_score: 85, ring: 2 },
  { parcel_id: 'FL-003', lat: 28.5383, lng: -81.3792, perfect_score: 91, ring: 1 },
  { parcel_id: 'CA-004', lat: 37.7749, lng: -122.4194, perfect_score: 76, ring: 3 },
  { parcel_id: 'CA-005', lat: 37.3382, lng: -121.8863, perfect_score: 82, ring: 2 },
]

export function LandingPage({ onExplore, onSignIn }: { onExplore: () => void; onSignIn: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollToPreview = () => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <main className="perfect-property-ui landing-page min-h-[100dvh] overflow-hidden bg-[#01070c] text-[#f3f6f8]">
      <header className="relative z-10 grid h-[76px] grid-cols-[250px_1fr_auto] items-center border-b border-[#7893a5]/18 bg-gradient-to-b from-[#02080d]/98 to-[#010608]/95 px-6 max-lg:grid-cols-[1fr_auto] max-md:h-[68px] max-sm:px-4 backdrop-blur-sm">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="justify-self-start transition-opacity hover:opacity-80" aria-label="Perfect Property home"><Brand/></button>
        <nav className="flex items-center justify-center gap-8 text-[12px] text-[#a7b3bb] max-[1180px]:hidden" aria-label="Homepage navigation">
          {[['platform','Platform'],['workflow','Deal engine'],['models','Model accuracy'],['evidence','Evidence']].map(([id,label])=>
            <a key={id} className="relative group font-medium transition-colors hover:text-[#dce4e9]" href={`#${id}`}>
              {label}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-[#efaa2d] transition-all duration-300 group-hover:w-full"/>
            </a>
          )}
        </nav>
        <div className="flex items-center justify-end gap-4">
          <div className="hidden items-center gap-2 text-[10px] text-[#8fa0ac] min-[1180px]:flex">
            <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#05d680] shadow-lg shadow-[#05d680]/50"/>
            Updated nightly · CA + FL
          </div>
          <button type="button" onClick={onSignIn} className="h-9 rounded-md border border-[#efaa2d]/70 px-4 text-[12px] font-semibold text-[#ffc24c] transition-all hover:bg-[#efaa2d]/10 hover:border-[#efaa2d]/90 active:scale-95 shadow-sm hover:shadow-[0_0_16px_rgba(239,170,45,.2)]">Sign in</button>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="landing-menu-button icon-button transition-transform hover:scale-110 active:scale-95" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="landing-mobile-navigation"><List size={21}/></button>
        </div>
        <AnimatePresence>{menuOpen && <motion.nav id="landing-mobile-navigation" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 210, damping: 24 }} className="absolute inset-x-3 top-[76px] grid gap-1 rounded-lg border border-[#7893a5]/22 bg-[#06131c]/98 p-2 shadow-[0_20px_60px_rgba(0,5,9,.5)] backdrop-blur-md min-[1181px]:hidden max-md:top-[68px]"><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-[#0a1420]" href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-[#0a1420]" href="#workflow" onClick={() => setMenuOpen(false)}>Deal engine</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-[#0a1420]" href="#models" onClick={() => setMenuOpen(false)}>Model accuracy</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-[#0a1420]" href="#evidence" onClick={() => setMenuOpen(false)}>Evidence</a></motion.nav>}</AnimatePresence>
      </header>

      <section className="landing-hero relative min-h-[584px] overflow-hidden border-b border-[#7893a5]/16 max-md:min-h-[740px]">
        <motion.img initial={false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }} src="/perfect-property-hero.png" alt="" className="absolute inset-y-0 left-0 h-full w-[104%] max-w-none object-cover object-[50%_58%] max-md:w-full max-md:object-[64%_52%]"/>
        <div className="landing-hero-exposure absolute inset-0"/>
        <div className="relative grid min-h-[584px] grid-cols-[minmax(0,1fr)_286px] gap-12 pl-[90px] pr-[105px] max-xl:px-14 max-lg:grid-cols-[minmax(0,1fr)_260px] max-md:min-h-[740px] max-md:grid-cols-1 max-md:px-5">
          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .09 } } }} className="flex max-w-[560px] flex-col justify-start pb-24 pt-[88px] max-md:pb-0 max-md:pt-16">
            <motion.p variants={heroReveal} className="mb-6 text-[13px] font-semibold tracking-[.08em] uppercase text-[#efaa2d] drop-shadow-sm">AI-powered real estate intelligence</motion.p>
            <motion.h1 variants={heroReveal} className="text-[56px] font-bold leading-[1.08] tracking-[-.045em] max-md:text-[43px] max-sm:text-[39px]">
              <span className="block">Intelligence.</span>
              <span className="block">Precision.</span>
              <span className="block bg-gradient-to-r from-[#efaa2d] to-[#ffc24c] bg-clip-text text-transparent">Perfect Property.</span>
            </motion.h1>
            <motion.p variants={heroReveal} className="mt-6 max-w-[500px] text-[17px] leading-[1.7] text-[#b3bcc5] max-sm:mt-4 max-sm:text-[15px] max-sm:leading-6">Evaluate markets, rank opportunities, and trace every signal to its source—inside one investment workspace.</motion.p>
            <motion.div variants={heroReveal} className="mt-8 flex flex-wrap gap-3 max-sm:mt-6 max-sm:grid max-sm:grid-cols-1 max-sm:gap-2">
              <motion.button whileHover={{ x: 2, y: -2 }} whileTap={{ scale: .98 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }} type="button" onClick={onExplore} className="landing-cta primary-button min-w-[205px] justify-between px-6 text-[13px] font-semibold shadow-lg shadow-[#efaa2d]/20 hover:shadow-[#efaa2d]/40 transition-shadow">Explore platform<ArrowRight size={18} weight="bold"/></motion.button>
              <motion.button whileTap={{ scale: .98 }} type="button" onClick={scrollToPreview} className="landing-cta control-button min-w-[198px] justify-center bg-[#06131c]/65 px-5 text-[13px] font-semibold backdrop-blur-lg border border-[#7893a5]/30 hover:border-[#7893a5]/50 transition-all hover:bg-[#08161e]"><Play size={18} weight="fill" className="text-[#efaa2d]"/>See how it works</motion.button>
            </motion.div>
          </motion.div>

          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .08, delayChildren: .18 } } }} className="flex flex-col justify-start gap-2.5 pt-[89px] max-md:hidden">
            {features.map(({ title, copy, icon: Icon }) => (
              <motion.article variants={railReveal} key={title} className="group relative overflow-hidden grid min-h-[92px] grid-cols-[58px_1px_1fr] items-center gap-4 rounded-[10px] border border-[#7893a5]/20 bg-[#06131c]/82 px-4 py-3 shadow-[0_18px_44px_rgba(0,5,9,.26),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-md transition-all hover:border-[#7893a5]/40 hover:bg-[#07151f] hover:shadow-[0_24px_48px_rgba(0,5,9,.35)]">
                <div className="absolute inset-0 bg-gradient-to-r from-[#efaa2d]/0 to-[#1a547d]/0 group-hover:from-[#efaa2d]/5 group-hover:to-[#1a547d]/8 transition-all"/>
                <Icon size={34} weight="regular" className="justify-self-center text-[#efaa2d] relative z-10"/>
                <i className="h-14 w-px bg-gradient-to-b from-[#7893a5]/20 to-[#7893a5]/5"/>
                <div className="relative z-10">
                  <h2 className="text-[14px] font-semibold text-[#f3f6f8] group-hover:text-[#efaa2d] transition-colors">{title}</h2>
                  <p className="mt-1.5 text-[12px] leading-[1.6] text-[#9aa9b3]">{copy}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>

          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: .55, type: 'spring', stiffness: 130, damping: 23 }} className="absolute bottom-5 left-[90px] grid min-h-[85px] w-[min(995px,calc(100%-430px))] grid-cols-4 divide-x divide-[#7893a5]/14 rounded-[10px] border border-[#7893a5]/22 bg-gradient-to-br from-[#06131c]/88 to-[#050a10]/88 shadow-[0_20px_54px_rgba(0,5,9,.4),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-md max-xl:left-14 max-md:bottom-5 max-md:left-5 max-md:right-5 max-md:w-auto max-md:grid-cols-2 max-md:divide-x-0 max-md:divide-y max-md:min-h-[150px]">
            {metrics.map(({ value, label, icon: Icon }) => (
              <div key={label} className="group grid grid-cols-[42px_1fr] items-center gap-3 px-6 py-3 transition-all max-xl:px-3">
                <Icon size={33} className="text-[#efaa2d] group-hover:scale-110 transition-transform"/>
                <div>
                  <strong className="block font-mono text-[20px] font-bold text-[#f4f7f8]">{value}</strong>
                  <span className="mt-1 block text-[11px] text-[#92a2ac] font-medium">{label}</span>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#7893a5]/16 bg-[#030b11]" aria-label="Trusted teams">
        <div className="mx-auto grid min-h-[100px] max-w-[1400px] grid-cols-[290px_repeat(4,1fr)] items-center px-8 py-8 max-xl:grid-cols-[250px_repeat(4,1fr)] max-lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-y-6 max-md:gap-x-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#efaa2d] drop-shadow-sm max-lg:col-span-full">Built for real estate decision teams</p>
          {personas.map(({ title, detail, icon: Icon }) => (
            <div key={title} className="group flex items-center gap-3 border-l border-[#7893a5]/14 px-6 py-2 transition-all hover:border-[#efaa2d]/40 max-md:border-l-0 max-md:px-0">
              <Icon size={24} className="text-[#a6b3bc] group-hover:text-[#efaa2d] transition-colors"/>
              <div>
                <strong className="block text-[11px] font-bold uppercase tracking-[.05em] text-[#f3f6f8]">{title}</strong>
                <span className="mt-1 block text-[9px] text-[#71838f] font-medium">{detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="platform" className="bg-[#01070c] px-8 pb-14 pt-12 max-md:px-4 max-md:pt-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_424px] gap-6 max-lg:grid-cols-1">
          <ProductPreview onExplore={onExplore}/>
          <aside id="evidence" className="flex min-h-[430px] flex-col justify-between border border-[#7893a5]/20 bg-[linear-gradient(155deg,#081620,#040c12)] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] max-md:min-h-0 max-md:p-6">
            <div><span className="font-mono text-[46px] leading-none text-[#efaa2d]">“</span><blockquote className="mt-4 max-w-[24ch] text-[21px] leading-[1.55] tracking-[-.02em] text-[#dce4e9]">The score gets attention. The evidence is what gets an investment through committee.</blockquote></div>
            <div className="mt-10 border-t border-[#7893a5]/16 pt-5"><strong className="block text-[12px]">Elena Marquez</strong><span className="mt-1 block text-[10px] text-[#7f929e]">Investment Principal · Ardent Ridge Capital</span><p className="mt-5 font-mono text-[9px] uppercase tracking-[.13em] text-[#657b89]">Representative workflow · Demo environment</p></div>
          </aside>
        </div>
      </section>

    </main>
  )
}

const heroReveal = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 22 } } }
const railReveal = { hidden: { opacity: 0, x: 18 }, visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 140, damping: 24 } } }

function ProductPreview({ onExplore }: { onExplore: () => void }) {
  const [selectedParcel, setSelectedParcel] = useState<string | null>(null)

  const exportPreview = () => {
    const rows = [
      ['Market', 'Opportunity score'],
      ['Los Angeles, CA', '94.2'],
      ['Miami, FL', '93.1'],
      ['Tampa, FL', '92.8'],
      ['San Diego, CA', '91.6'],
    ]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'perfect-property-market-preview.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <article id="workflow" className="overflow-hidden border border-[#7893a5]/20 bg-gradient-to-br from-[#040d14] to-[#030810] shadow-[inset_0_1px_0_rgba(255,255,255,.025),0_8px_32px_rgba(0,0,0,.4)]">
      {/* Header */}
      <div className="flex h-13 items-center border-b border-[#7893a5]/16 px-5 backdrop-blur-sm">
        <Brand compact/>
        <strong className="ml-4 text-[13px] font-semibold tracking-[-0.01em] text-[#f3f6f8]">Market overview</strong>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.12em] text-[#4fd589]">
            <i className="h-1.5 w-1.5 rounded-full bg-[#05d680] shadow-lg shadow-[#05d680]/50"/>Live data
          </span>
          <time className="grid h-8 place-items-center rounded-md border border-[#7893a5]/20 bg-[#0a1420]/60 px-3 font-mono text-[8px] text-[#8da0ac] max-sm:hidden" dateTime="2024-05-12/2024-06-12">May 12 – Jun 12</time>
          <button type="button" onClick={exportPreview} className="h-8 rounded-md border border-[#7893a5]/20 bg-[#0a1420]/60 px-3 text-[8px] text-[#a8b5bd] transition-all hover:border-[#7893a5]/40 hover:bg-[#0f1a28] active:scale-95 max-sm:hidden">Export</button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="grid min-h-[400px] grid-cols-[140px_minmax(0,1fr)] max-sm:grid-cols-1">
        <div className="border-r border-[#7893a5]/14 bg-[#030b11] p-3 max-sm:hidden">
          {[[MapTrifold,'Market map'],[Target,'Deal pipeline'],[ChartLineUp,'Predictions'],[Database,'Sources']].map(([Icon,label],index)=>{
            const IconComponent=Icon as typeof MapTrifold;
            return (
              <button type="button" onClick={onExplore} key={label as string} aria-current={index === 0 ? 'page' : undefined} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[10px] font-medium transition-all ${index===0?'border-l-2 border-[#efaa2d] bg-[#efaa2d]/[.08] text-[#f3f6f8] shadow-sm shadow-[#efaa2d]/20':'text-[#738692] hover:text-[#8da0ac] hover:bg-[#0a1420]'}`}>
                <IconComponent size={15} weight={index===0?'fill':'regular'}/>
                <span>{label as string}</span>
              </button>
            )
          })}
        </div>

        {/* Content area */}
        <div className="p-5 flex flex-col gap-5">
          {/* KPI Cards */}
          <div id="models" className="grid scroll-mt-24 grid-cols-4 gap-3 max-md:grid-cols-2">
            {[['Analyzed','102,834','+12.5%'],['Strong deals','3,842','+8.2%'],['Markets','24','CA + FL'],['Accuracy','94.2%','+2.1%']].map(([label,value,change])=>
              <div key={label} className="group relative overflow-hidden rounded-lg border border-[#7893a5]/15 bg-gradient-to-br from-[#0a1420] to-[#07131b] p-4 transition-all hover:border-[#7893a5]/30 hover:shadow-lg hover:shadow-[#7893a5]/10">
                <div className="absolute inset-0 bg-gradient-to-br from-[#efaa2d]/0 to-[#1a547d]/0 group-hover:from-[#efaa2d]/5 group-hover:to-[#1a547d]/10 transition-all"/>
                <span className="relative text-[8px] font-semibold uppercase tracking-[.08em] text-[#718592] group-hover:text-[#8da0ac]">{label}</span>
                <strong className="relative mt-2 block font-mono text-[19px] font-bold text-[#f3f6f8]">{value}</strong>
                <small className={`relative mt-2 block font-mono text-[8px] font-semibold ${change.startsWith('+')?'text-[#4fd589]':'text-[#718592]'}`}>{change}</small>
              </div>
            )}
          </div>

          {/* Main visualization area - Map + Markets */}
          <div className="grid grid-cols-[1.4fr_.75fr] gap-4 max-md:grid-cols-1 flex-1 min-h-[280px]">
            {/* Map Section */}
            <motion.div 
              initial={{ opacity: 0, y: 4 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.1, duration: 0.5 }}
              className="relative min-h-[280px] overflow-hidden rounded-lg border border-[#7893a5]/15 bg-[#061018] shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"
            >
              <div className="absolute top-3 left-4 z-10">
                <p className="text-[10px] font-semibold text-[#f3f6f8] tracking-[-0.01em]">Geographic heat map</p>
                <p className="text-[8px] text-[#718592] mt-1">Active opportunities by region</p>
              </div>
              <PreviewMap
                parcels={sampleParcels}
                center={[-97, 29]}
                zoom={5}
                selectedId={selectedParcel}
                onSelect={setSelectedParcel}
              />
            </motion.div>

            {/* Markets Ranking */}
            <motion.div 
              initial={{ opacity: 0, y: 4 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.15, duration: 0.5 }}
              className="rounded-lg border border-[#7893a5]/15 bg-[#061018] p-4 overflow-y-auto"
            >
              <p className="text-[10px] font-semibold text-[#f3f6f8] tracking-[-0.01em] mb-3">Top markets</p>
              <div className="space-y-2.5">
                {[['Los Angeles, CA','94.2','88%'],['Miami, FL','93.1','82%'],['Tampa, FL','92.8','76%'],['San Diego, CA','91.6','70%']].map(([market,score,width],index)=>
                  <div key={market} className="group">
                    <div className="grid grid-cols-[20px_1fr_auto] items-center gap-2 text-[9px] pb-2.5 border-b border-[#7893a5]/10 last:border-0">
                      <span className="font-mono font-semibold text-[#efaa2d] text-[10px]">{index+1}</span>
                      <div className="min-w-0">
                        <div className="text-[#f3f6f8] font-medium truncate group-hover:text-[#efaa2d] transition-colors">{market}</div>
                        <div className="mt-1.5 h-1 rounded-full bg-[#7893a5]/20 overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-[#efaa2d] to-[#ffc24c] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width }}
                            transition={{ delay: 0.3 + index * 0.1, duration: 0.8, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                      <strong className="font-mono font-semibold text-[#efaa2d] text-[10px] whitespace-nowrap">{score}</strong>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <button 
        type="button" 
        onClick={onExplore} 
        className="flex h-12 w-full items-center justify-center gap-2 border-t border-[#7893a5]/16 bg-gradient-to-r from-[#07131b] to-[#0a1420] text-[11px] font-semibold text-[#efaa2d] transition-all hover:from-[#0f1a28] hover:to-[#0f1a28] hover:text-[#ffc24c] active:scale-98 group"
      >
        Open interactive workspace
        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform"/>
      </button>
    </article>
  )
}

function PreviewMap(props: {
  parcels: MapParcel[]
  center: [number, number]
  zoom: number
  selectedId: string | null
  onSelect: (parcelId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0" aria-label="Interactive preview map">
      {shouldLoad ? (
        <Suspense fallback={<MapPreviewFallback />}>
          <LazyMapView {...props} className="h-full w-full" />
        </Suspense>
      ) : (
        <MapPreviewFallback />
      )}
    </div>
  )
}

function MapPreviewFallback() {
  return <div className="h-full w-full animate-pulse bg-[radial-gradient(circle_at_34%_44%,rgba(26,84,125,.22),transparent_54%),#061018]" aria-hidden="true" />
}
