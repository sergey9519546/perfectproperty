import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight, Brain, Buildings, ChartLineUp, Database, Gauge,
  Lightning, List, LockKey, MapTrifold, Play, ShieldCheck, Stack, Target,
} from '@phosphor-icons/react'
import { Brand } from './Brand'

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

export function LandingPage({ onExplore, onSignIn }: { onExplore: () => void; onSignIn: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollToPreview = () => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <main className="landing-page min-h-[100dvh] overflow-hidden bg-[#01070c] text-[#f3f6f8]">
      <header className="relative z-10 grid h-[76px] grid-cols-[250px_1fr_auto] items-center border-b border-[#7893a5]/18 bg-[#02080d]/98 px-6 max-lg:grid-cols-[1fr_auto] max-sm:px-4">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="justify-self-start" aria-label="Perfect Property home"><Brand/></button>
        <nav className="flex items-center justify-center gap-12 text-[12px] text-[#a7b3bb] max-[1180px]:hidden" aria-label="Homepage navigation">
          <a className="landing-nav-link" href="#platform">Platform</a>
          <a className="landing-nav-link" href="#workflow">Deal engine</a>
          <a className="landing-nav-link" href="#models">Model accuracy</a>
          <a className="landing-nav-link" href="#evidence">Evidence</a>
        </nav>
        <div className="flex items-center justify-end gap-4">
          <div className="hidden items-center gap-2 text-[10px] text-[#8fa0ac] min-[1180px]:flex"><motion.i animate={{ opacity: [.55, 1, .55], scale: [.92, 1, .92] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} className="h-1.5 w-1.5 rounded-full bg-[#05d680]"/>Updated nightly · CA + FL</div>
          <button type="button" onClick={onSignIn} className="h-9 rounded-[5px] border border-[#efaa2d]/70 px-4 text-[12px] font-medium text-[#ffc24c] transition-colors hover:bg-[#efaa2d]/10 active:translate-y-px">Sign in</button>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="landing-menu-button icon-button" aria-label="Toggle navigation"><List size={21}/></button>
        </div>
        <AnimatePresence>{menuOpen && <motion.nav initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 210, damping: 24 }} className="absolute inset-x-3 top-[72px] grid gap-1 border border-[#7893a5]/22 bg-[#06131c]/98 p-2 shadow-[0_20px_60px_rgba(0,5,9,.5)] lg:hidden"><a className="px-3 py-2 text-sm" href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a className="px-3 py-2 text-sm" href="#workflow" onClick={() => setMenuOpen(false)}>Deal engine</a><a className="px-3 py-2 text-sm" href="#models" onClick={() => setMenuOpen(false)}>Model accuracy</a><a className="px-3 py-2 text-sm" href="#evidence" onClick={() => setMenuOpen(false)}>Evidence</a></motion.nav>}</AnimatePresence>
      </header>

      <section className="landing-hero relative min-h-[584px] overflow-hidden border-b border-[#7893a5]/16 max-md:min-h-[760px]">
        <motion.img initial={false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }} src="/perfect-property-hero.png" alt="" className="absolute inset-y-0 left-0 h-full w-[104%] max-w-none object-cover object-[50%_58%] max-md:w-full max-md:object-[64%_52%]"/>
        <div className="landing-hero-exposure absolute inset-0"/>
        <div className="relative grid min-h-[584px] grid-cols-[minmax(0,1fr)_286px] gap-12 pl-[90px] pr-[56px] max-xl:px-14 max-lg:grid-cols-[minmax(0,1fr)_260px] max-md:min-h-[760px] max-md:grid-cols-1 max-md:px-5">
          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .09 } } }} className="flex max-w-[560px] flex-col justify-start pb-24 pt-[88px] max-md:pb-0 max-md:pt-16">
            <motion.p variants={heroReveal} className="mb-5 text-[13px] font-medium tracking-[.02em] text-[#efaa2d]">AI-powered real estate intelligence</motion.p>
            <motion.h1 variants={heroReveal} className="text-[56px] font-semibold leading-[1.08] tracking-[-.045em] max-md:text-[43px] max-sm:text-[39px]">
              <span className="block">Intelligence.</span>
              <span className="block">Precision.</span>
              <span className="block text-[#efaa2d]">Perfect Property.</span>
            </motion.h1>
            <motion.p variants={heroReveal} className="mt-5 max-w-[500px] text-[17px] leading-7 text-[#a9b5be] max-sm:text-[15px] max-sm:leading-6">Evaluate markets, rank opportunities, and trace every signal to its source—inside one investment workspace.</motion.p>
            <motion.div variants={heroReveal} className="mt-7 flex flex-wrap gap-3 max-sm:grid max-sm:grid-cols-1">
              <motion.button whileHover={{ x: 2 }} whileTap={{ scale: .985 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }} type="button" onClick={onExplore} className="landing-cta primary-button min-w-[205px] justify-between px-6 text-[13px]">Explore platform<ArrowRight size={18}/></motion.button>
              <motion.button whileTap={{ scale: .985 }} type="button" onClick={scrollToPreview} className="landing-cta control-button min-w-[198px] justify-center bg-[#06131c]/55 px-5 text-[13px] backdrop-blur-md"><Play size={18} className="text-[#efaa2d]"/>See how it works</motion.button>
            </motion.div>
          </motion.div>

          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .08, delayChildren: .18 } } }} className="flex flex-col justify-start gap-2.5 pt-[89px] max-md:hidden">
            {features.map(({ title, copy, icon: Icon }) => <motion.article variants={railReveal} key={title} className="grid min-h-[90px] grid-cols-[58px_1px_1fr] items-center gap-4 rounded-[9px] border border-[#7893a5]/20 bg-[#06131c]/76 px-4 py-3 shadow-[0_18px_44px_rgba(0,5,9,.26),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-md"><Icon size={34} weight="regular" className="justify-self-center text-[#efaa2d]"/><i className="h-14 w-px bg-[#7893a5]/16"/><div><h2 className="text-[14px] font-medium">{title}</h2><p className="mt-1 text-[12px] leading-[1.5] text-[#9aa9b3]">{copy}</p></div></motion.article>)}
          </motion.div>

          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: .55, type: 'spring', stiffness: 130, damping: 23 }} className="absolute bottom-5 left-[90px] grid min-h-[85px] w-[min(995px,calc(100%-430px))] grid-cols-4 divide-x divide-[#7893a5]/16 rounded-[8px] border border-[#7893a5]/20 bg-[#06131c]/84 shadow-[0_20px_54px_rgba(0,5,9,.3),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-md max-xl:left-14 max-md:bottom-5 max-md:left-5 max-md:right-5 max-md:w-auto max-md:grid-cols-2 max-md:divide-x-0 max-md:divide-y max-md:min-h-[150px]">
            {metrics.map(({ value, label, icon: Icon }) => <div key={label} className="grid grid-cols-[42px_1fr] items-center gap-3 px-6 max-xl:px-3"><Icon size={33} className="text-[#efaa2d]"/><div><strong className="block font-mono text-[20px] font-medium text-[#f4f7f8]">{value}</strong><span className="mt-1 block text-[11px] text-[#92a2ac]">{label}</span></div></div>)}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#7893a5]/16 bg-[#030b11]" aria-label="Trusted teams">
        <div className="mx-auto grid min-h-[86px] max-w-[1400px] grid-cols-[290px_repeat(4,1fr)_repeat(3,86px)] items-center px-8 max-xl:grid-cols-[250px_repeat(4,1fr)] max-lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-y-5 max-md:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[.12em] text-[#efaa2d] max-lg:col-span-full">Built for real estate decision teams</p>
          {personas.map(({ title, detail, icon: Icon }) => <div key={title} className="flex items-center gap-3 border-l border-[#7893a5]/14 px-6 max-md:border-l-0 max-md:px-0"><Icon size={24} className="text-[#a6b3bc]"/><div><strong className="block text-[11px] font-medium uppercase tracking-[.04em]">{title}</strong><span className="mt-1 block text-[9px] text-[#71838f]">{detail}</span></div></div>)}
          <div className="grid justify-items-center gap-1 border-l border-[#7893a5]/14 text-center max-xl:hidden"><Database size={20} className="text-[#9eabb4]"/><span className="text-[8px] uppercase tracking-[.08em] text-[#71838f]">Data lineage</span></div>
          <div className="grid justify-items-center gap-1 border-l border-[#7893a5]/14 text-center max-xl:hidden"><ChartLineUp size={20} className="text-[#9eabb4]"/><span className="text-[8px] uppercase tracking-[.08em] text-[#71838f]">Model notes</span></div>
          <div className="grid justify-items-center gap-1 border-l border-[#7893a5]/14 text-center max-xl:hidden"><Gauge size={20} className="text-[#efaa2d]"/><span className="text-[8px] uppercase tracking-[.08em] text-[#71838f]">Demo mode</span></div>
        </div>
      </section>

      <section id="platform" className="bg-[#01070c] px-8 pb-14 pt-5 max-md:px-4 max-md:pt-8">
        <div className="mx-auto grid max-w-[1328px] grid-cols-[minmax(0,1fr)_424px] gap-6 max-lg:grid-cols-1">
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
  return (
    <article id="workflow" className="overflow-hidden border border-[#7893a5]/20 bg-[#040d14] shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <div className="flex h-12 items-center border-b border-[#7893a5]/16 px-4"><Brand compact/><strong className="ml-3 text-[13px] font-medium">Overview</strong><div className="ml-auto flex items-center gap-2"><span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#718592]"><i className="h-1.5 w-1.5 rounded-full bg-[#05d680]"/>Live demo</span><button type="button" className="h-7 border border-[#7893a5]/16 px-2 font-mono text-[8px] text-[#8da0ac] max-sm:hidden">May 12 – Jun 12</button><button type="button" className="h-7 border border-[#7893a5]/16 px-2 text-[9px] text-[#a8b5bd] max-sm:hidden">Export</button></div></div>
      <div className="grid min-h-[382px] grid-cols-[150px_minmax(0,1fr)] max-sm:grid-cols-1">
        <div className="border-r border-[#7893a5]/14 bg-[#030b11] p-3 max-sm:hidden">{[[MapTrifold,'Market map'],[Target,'Deal pipeline'],[Buildings,'Off-market'],[ChartLineUp,'Predictions'],[Gauge,'Model accuracy'],[Database,'Sources']].map(([Icon,label],index)=>{const IconComponent=Icon as typeof MapTrifold;return <div key={label as string} className={`flex items-center gap-2 px-3 py-2 text-[10px] ${index===0?'border-l-2 border-[#efaa2d] bg-[#efaa2d]/[.055] text-[#efaa2d]':'text-[#738692]'}`}><IconComponent size={15}/>{label as string}</div>})}</div>
        <div className="p-4">
          <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">{[['Analyzed','102,834','+12.5%'],['Strong deals','3,842','+8.2%'],['Markets','24','CA + FL'],['Accuracy','94.2%','+2.1%']].map(([label,value,change])=><div key={label} className="border border-[#7893a5]/15 bg-[#07131b] p-3"><span className="text-[9px] text-[#718592]">{label}</span><strong className="mt-2 block font-mono text-[17px] font-medium">{value}</strong><small className={`mt-2 block font-mono text-[8px] ${change.startsWith('+')?'text-[#4fd589]':'text-[#718592]'}`}>{change}</small></div>)}</div>
          <div className="mt-3 grid grid-cols-[1.4fr_.8fr] gap-3 max-md:grid-cols-1">
            <div className="relative min-h-[220px] overflow-hidden border border-[#7893a5]/15 bg-[radial-gradient(circle_at_30%_40%,rgba(0,80,125,.18),transparent_58%),#030b11] p-4"><p className="text-[10px] font-medium">Market performance</p><svg viewBox="0 0 540 210" className="absolute inset-x-3 bottom-0 h-[185px] w-[calc(100%-24px)]" aria-hidden="true"><path d="M55 38 105 22l42 20 50-7 33 27 56-14 48 18 61-9 36 23 48-5 18 35-21 41-55 3-38 23-59-10-54 14-44-30-55 5-42-29-42-2-16-39Z" fill="rgba(26,54,70,.52)" stroke="rgba(112,145,164,.42)"/><path d="M76 55 112 69 155 63 186 91 220 79 258 104 296 88 332 117 371 99 413 126 455 108" fill="none" stroke="#efaa2d" strokeWidth="1.5" strokeDasharray="3 4"/>{[[95,60],[154,65],[220,81],[259,102],[333,116],[413,125],[454,108]].map(([cx,cy])=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#efaa2d"/>)}</svg></div>
            <div className="border border-[#7893a5]/15 bg-[#061018] p-4"><p className="text-[10px] font-medium">Top markets</p>{[['Los Angeles, CA','94.2','88%'],['Miami, FL','93.1','82%'],['Tampa, FL','92.8','76%'],['San Diego, CA','91.6','70%']].map(([market,score,width],index)=><div key={market} className="grid grid-cols-[18px_1fr_auto] items-center border-b border-[#7893a5]/10 py-3 text-[10px]"><span className="font-mono text-[#718592]">{index+1}</span><div><span>{market}</span><i className="mt-1.5 block h-px bg-[#efaa2d]/75" style={{width}}/></div><strong className="font-mono font-medium text-[#efaa2d]">{score}</strong></div>)}</div>
          </div>
        </div>
      </div>
      <button type="button" onClick={onExplore} className="flex h-11 w-full items-center justify-center gap-2 border-t border-[#7893a5]/16 bg-[#07131b] text-[11px] text-[#efaa2d] transition-colors hover:bg-[#0a1b27]">Open interactive workspace<ArrowRight size={15}/></button>
    </article>
  )
}
