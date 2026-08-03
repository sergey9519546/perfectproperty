import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight, Brain, Buildings, ChartLineUp, Database, Gauge,
  Lightning, List, LockKey, MapTrifold, Pause, Play, ShieldCheck, Stack, Target,
} from '@phosphor-icons/react'
import { Brand } from './Brand'
import type { MapParcel } from '@/components/MapView'
import { observeProductExperience, trackProductEvent } from '@/lib/product-analytics'
import { markets, portfolioSummary, formatShortDate } from '../data'
import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { listRankedParcels } from '@/lib/parcels.functions'
import { supabase } from '@/integrations/supabase/client'
import { toWorkspaceParcel, coverageFromParcels } from '../live'
import type { RankedParcelRow } from '../live-types'

const LazyMapView = lazy(() => import('@/components/MapView').then((module) => ({ default: module.MapView })))

const features = [
  { title: 'AI-powered models', copy: 'Rank parcels with calibrated, explainable scores.', icon: Brain },
  { title: 'Live underwriting pipeline', copy: 'Scores refresh from county, distress, and comps feeds.', icon: Stack },
  { title: 'Evidence by default', copy: 'Trace every score to its underlying source.', icon: ShieldCheck },
  { title: 'Underwriting actions', copy: 'Move from signal to investment memo without handoffs.', icon: ChartLineUp },
]

const portfolio = portfolioSummary(markets)

const metrics = [
  { value: portfolio.topScore.toFixed(1), label: 'Top opportunity score', icon: Target },
  { value: String(portfolio.totalOpportunities), label: 'Calibrated opportunities', icon: ChartLineUp },
  { value: String(portfolio.sourceFamilyCount), label: 'Validated source families', icon: ShieldCheck },
  { value: 'Nightly', label: 'Market data refresh', icon: Lightning },
]

const previewParcels: MapParcel[] = markets.map((m, index) => ({
  parcel_id: m.id,
  lat: m.coordinates[1],
  lng: m.coordinates[0],
  perfect_score: Math.round(m.score),
  ring: (index % 3) + 1,
}))

const personas = [
  { title: 'Investors', detail: 'Institutional & private', icon: Buildings },
  { title: 'Acquisitions', detail: 'Market and deal teams', icon: Target },
  { title: 'Lenders', detail: 'Risk and credit groups', icon: Gauge },
  { title: 'Institutions', detail: 'Family offices & funds', icon: LockKey },
]

export function LandingPage({ onExplore, onSignIn }: { onExplore: () => void; onSignIn: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const listFn = useServerFn(listRankedParcels)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user))
  }, [])

  const liveQ = useQuery({
    queryKey: ['landing-ranked-preview'],
    queryFn: () => listFn({ data: { limit: 200 } }),
    enabled: authed,
    staleTime: 60_000,
  })

  const liveParcels = useMemo(() => {
    const rows = (liveQ.data ?? []) as RankedParcelRow[]
    return rows.map(toWorkspaceParcel).filter((p): p is NonNullable<typeof p> => p != null)
  }, [liveQ.data])

  const liveSummary = useMemo(() => {
    if (!liveParcels.length) return null
    const top = [...liveParcels].sort((a, b) => b.score - a.score)
    return {
      count: liveParcels.length,
      topScore: top[0]?.score ?? 0,
      coverage: coverageFromParcels(liveParcels),
      topMarkets: top.slice(0, 4),
      snapshotIso: top[0]?.computedAt ?? null,
    }
  }, [liveParcels])

  const displayMetrics = liveSummary
    ? [
        { value: liveSummary.topScore.toFixed(1), label: 'Top perfect score', icon: Target },
        { value: String(liveSummary.count), label: 'Live scored parcels', icon: ChartLineUp },
        { value: liveSummary.coverage, label: 'State coverage', icon: ShieldCheck },
        { value: 'LIVE', label: 'parcel_scores feed', icon: Lightning },
      ]
    : metrics

  const displayPreviewParcels: MapParcel[] = liveParcels.length
    ? liveParcels.slice(0, 40).map((p) => ({
        parcel_id: p.id,
        lat: p.coordinates[1],
        lng: p.coordinates[0],
        perfect_score: Math.round(p.score),
        ring: p.ring,
      }))
    : previewParcels

  const scrollToStory = () => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })

  useEffect(() => {
    void trackProductEvent('landing_view', { onceKey: 'landing-view' })
    return observeProductExperience('landing')
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <main className="perfect-property-ui landing-page min-h-[100dvh] overflow-hidden bg-pp-page text-pp-text">
      <header className="relative z-10 grid h-[76px] grid-cols-[250px_1fr_auto] items-center border-b border-pp-border/18 bg-gradient-to-b from-pp-header/98 to-pp-page/95 px-6 max-lg:grid-cols-[1fr_auto] max-md:h-[68px] max-sm:px-4 backdrop-blur-sm">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="justify-self-start transition-opacity hover:opacity-80" aria-label="Perfect Property home"><Brand/></button>
        <nav className="flex items-center justify-center gap-8 text-sm text-pp-muted max-[1180px]:hidden" aria-label="Homepage navigation">
          {[['platform','Platform'],['workflow','Deal engine'],['models','Model accuracy'],['evidence','Evidence']].map(([id,label])=>
            <a key={id} className="relative group font-medium transition-colors hover:text-pp-text" href={`#${id}`}>
              {label}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-pp-gold transition-all duration-300 group-hover:w-full"/>
            </a>
          )}
        </nav>
        <div className="flex items-center justify-end gap-4">
          <div className="hidden items-center gap-2 text-xs text-pp-muted min-[1180px]:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pp-live"/>
            Coverage · {portfolio.coverage}
          </div>
          <button type="button" onClick={onSignIn} className="h-9 rounded-md border border-pp-gold/70 px-4 text-sm font-semibold text-pp-gold-bright transition-all hover:bg-pp-gold/10 hover:border-pp-gold/90 active:scale-95 shadow-sm hover:shadow-glow-gold">Sign in</button>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="landing-menu-button icon-button transition-transform hover:scale-110 active:scale-95" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="landing-mobile-navigation"><List size={21}/></button>
        </div>
        <AnimatePresence>{menuOpen && <motion.nav id="landing-mobile-navigation" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 210, damping: 24 }} className="absolute inset-x-3 top-[76px] grid gap-1 rounded-lg border border-pp-border/22 bg-pp-surface/98 p-2 shadow-xl backdrop-blur-md min-[1181px]:hidden max-md:top-[68px]"><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-pp-surface-soft" href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-pp-surface-soft" href="#workflow" onClick={() => setMenuOpen(false)}>Deal engine</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-pp-surface-soft" href="#models" onClick={() => setMenuOpen(false)}>Model accuracy</a><a className="rounded-md px-4 py-3 text-sm font-medium transition-colors hover:bg-pp-surface-soft" href="#evidence" onClick={() => setMenuOpen(false)}>Evidence</a></motion.nav>}</AnimatePresence>
      </header>

      <section className="landing-hero relative min-h-[584px] overflow-hidden border-b border-pp-border/18 max-md:min-h-[740px]">
        <motion.img initial={false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }} src="/perfect-property-hero.png" alt="" className="absolute inset-y-0 left-0 h-full w-[104%] max-w-none object-cover object-[50%_58%] max-md:w-full max-md:object-[64%_52%]"/>
        <div className="landing-hero-exposure absolute inset-0"/>
        <div className="relative grid min-h-[584px] grid-cols-[minmax(0,1fr)_286px] gap-12 pl-[90px] pr-[105px] max-xl:px-14 max-lg:grid-cols-[minmax(0,1fr)_260px] max-md:min-h-[740px] max-md:grid-cols-1 max-md:px-5">
          <div className="flex min-w-0 flex-col justify-between pb-8 pt-[88px] max-md:pt-16">
          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .09 } } }} className="flex max-w-[560px] flex-col justify-start">
            <motion.p variants={heroReveal} className="mb-6 text-md font-semibold tracking-wider uppercase text-pp-gold drop-shadow-sm">AI-powered real estate intelligence</motion.p>
            <motion.h1 variants={heroReveal} className="text-hero font-bold leading-tight tracking-tight max-md:text-6xl max-sm:text-6xl">
              <span className="block">Intelligence.</span>
              <span className="block">Precision.</span>
              <span className="block bg-gradient-to-r from-pp-gold to-pp-gold-bright bg-clip-text text-transparent">Perfect Property.</span>
            </motion.h1>
            <motion.p variants={heroReveal} className="mt-6 max-w-[500px] text-xl leading-relaxed text-pp-muted max-sm:mt-4 max-sm:text-lg max-sm:leading-6">Evaluate markets, rank opportunities, and trace every signal to its source—inside one investment workspace.</motion.p>
            <motion.div variants={heroReveal} className="mt-8 flex flex-wrap gap-3 max-sm:mt-6 max-sm:grid max-sm:grid-cols-1 max-sm:gap-2">
              <motion.button whileHover={{ x: 2, y: -2 }} whileTap={{ scale: .98 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }} type="button" onClick={onExplore} className="landing-cta primary-button min-w-[205px] justify-between px-6 text-md font-semibold shadow-lg shadow-pp-gold/20 hover:shadow-pp-gold/40 transition-shadow">Explore platform<ArrowRight size={18} weight="bold"/></motion.button>
              <motion.button whileTap={{ scale: .98 }} type="button" onClick={scrollToStory} className="landing-cta control-button min-w-[198px] justify-center bg-pp-surface/65 px-5 text-md font-semibold backdrop-blur-lg border border-pp-border/30 hover:border-pp-border/50 transition-all hover:bg-pp-surface-soft"><Play size={18} weight="fill" className="text-pp-gold"/>See how it works</motion.button>
            </motion.div>
          </motion.div>

          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: .55, type: 'spring', stiffness: 130, damping: 23 }} className="mt-14 grid min-h-[85px] grid-cols-4 divide-x divide-pp-border/18 rounded-xl border border-pp-border/18 bg-gradient-to-br from-pp-surface/88 to-pp-page/88 shadow-lg backdrop-blur-md max-md:mt-10 max-md:grid-cols-2 max-md:divide-x-0 max-md:divide-y max-md:min-h-[150px]">
            {displayMetrics.map(({ value, label, icon: Icon }) => (
              <div key={label} className="group grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 px-5 py-3 transition-all max-xl:px-3">
                <Icon size={30} className="shrink-0 text-pp-gold group-hover:scale-110 transition-transform"/>
                <div className="min-w-0">
                  <strong className="block font-mono text-2xl font-bold text-pp-text">{value}</strong>
                  <span className="mt-1 block text-xs text-pp-muted font-medium">{label}</span>
                </div>
              </div>
            ))}
          </motion.div>
          </div>

          <motion.div initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: .08, delayChildren: .18 } } }} className="flex flex-col justify-start gap-2.5 pb-8 pt-[89px] max-md:hidden">
            {features.map(({ title, copy, icon: Icon }) => (
              <motion.article variants={railReveal} key={title} className="group relative overflow-hidden grid min-h-[92px] grid-cols-[58px_1px_minmax(0,1fr)] items-center gap-4 rounded-xl border border-pp-border/20 bg-pp-surface/82 px-4 py-3 shadow-md backdrop-blur-md transition-all hover:border-pp-border/40 hover:bg-pp-surface hover:shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-r from-pp-gold/0 to-transparent group-hover:from-pp-gold/5 group-hover:to-pp-gold/8 transition-all"/>
                <Icon size={34} weight="regular" className="justify-self-center text-pp-gold relative z-10"/>
                <span aria-hidden="true" className="h-14 w-px bg-gradient-to-b from-pp-border/20 to-pp-border/5"/>
                <div className="relative z-10 min-w-0">
                  <h2 className="text-lg font-semibold text-pp-text group-hover:text-pp-gold transition-colors">{title}</h2>
                  <p className="mt-1.5 text-sm leading-normal text-pp-muted">{copy}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>

      </section>

      <section className="border-b border-pp-border/18 bg-pp-surface" aria-label="Trusted teams">
        <div className="mx-auto grid min-h-[100px] max-w-[1400px] grid-cols-[290px_repeat(4,1fr)] items-center px-8 py-8 max-xl:grid-cols-[250px_repeat(4,1fr)] max-lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-y-6 max-md:gap-x-4">
          <p className="text-xs font-bold uppercase tracking-widest text-pp-gold drop-shadow-sm max-lg:col-span-full">Built for real estate decision teams</p>
          {personas.map(({ title, detail, icon: Icon }) => (
            <div key={title} className="group flex items-center gap-3 border-l border-pp-border/18 px-6 py-2 transition-all hover:border-pp-gold/40 max-md:border-l-0 max-md:px-0">
              <Icon size={24} className="text-pp-muted group-hover:text-pp-gold transition-colors"/>
              <div>
                <strong className="block text-sm font-bold uppercase tracking-wide text-pp-text">{title}</strong>
                <span className="mt-1 block text-xs text-pp-faint font-medium">{detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <MotionShowcase onExplore={onExplore}/>

      <section id="platform" className="bg-pp-page px-8 pb-14 pt-12 max-md:px-4 max-md:pt-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_424px] gap-6 max-lg:grid-cols-1">
          <ProductPreview onExplore={onExplore} live={liveSummary} liveLoading={authed && liveQ.isLoading} mapParcels={displayPreviewParcels}/>
          <aside id="evidence" className="flex min-h-[430px] flex-col justify-between border border-pp-border/18 bg-[linear-gradient(155deg,var(--pp-surface-raised),var(--pp-header))] p-8 shadow-xs max-md:min-h-0 max-md:p-6">
            <div><span className="font-mono text-5xl leading-none text-pp-gold">“</span><blockquote className="mt-4 max-w-[24ch] text-3xl leading-normal tracking-[-.02em] text-pp-text">The score gets attention. The evidence is what gets an investment through committee.</blockquote></div>
            <div className="mt-10 border-t border-pp-border/16 pt-5"><strong className="block text-sm">Investment Principal</strong><span className="mt-1 block text-xs text-pp-muted">Institutional capital deployment</span><p className="mt-5 font-mono text-xs uppercase tracking-[.13em] text-pp-faint">Investment committee workflow</p></div>
          </aside>
        </div>
      </section>

    </main>
  )
}

const heroReveal = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 22 } } }
const railReveal = { hidden: { opacity: 0, x: 18 }, visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 140, damping: 24 } } }

function MotionShowcase({ onExplore }: { onExplore: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const storyRef = useRef<HTMLElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !reducedMotion.matches) {
          void video.play().catch(() => setIsPlaying(false))
        } else {
          video.pause()
        }
      },
      { threshold: 0.35 },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const story = storyRef.current
    if (!story) return
    let exposureTimer: number | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (exposureTimer === null) {
            exposureTimer = window.setTimeout(() => {
              void trackProductEvent('story_viewed', {
                durationMs: 5000,
                properties: { visibility_threshold: 0.35 },
                onceKey: 'story-exposure',
              })
              exposureTimer = null
            }, 5000)
          }
        } else if (exposureTimer !== null) {
          window.clearTimeout(exposureTimer)
          exposureTimer = null
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(story)
    return () => {
      observer.disconnect()
      if (exposureTimer !== null) window.clearTimeout(exposureTimer)
    }
  }, [])

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false))
    } else {
      video.pause()
    }
  }

  return (
    <section ref={storyRef} id="story" className="scroll-mt-20 border-b border-pp-border/16 bg-[radial-gradient(circle_at_76%_42%,var(--pp-blue),transparent_34%),var(--pp-page)] px-8 py-16 max-md:px-4 max-md:py-10">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-9 grid grid-cols-[minmax(0,1fr)_430px] items-end gap-12 max-lg:grid-cols-1 max-lg:gap-5">
          <div>
            <h2 className="max-w-[760px] text-5xl font-bold leading-tight tracking-tight max-md:text-5xl">See the decision unfold.</h2>
            <p className="mt-4 max-w-[720px] text-lg leading-7 text-pp-muted max-md:text-lg">Follow an opportunity from market signal to source evidence and a committee-ready underwriting action.</p>
          </div>
          <button type="button" onClick={onExplore} className="group ml-auto flex items-center gap-3 text-sm font-semibold text-pp-gold transition-colors hover:text-pp-gold-bright max-lg:ml-0">
            Open the interactive workspace
            <ArrowRight size={17} className="transition-transform group-hover:translate-x-1"/>
          </button>
        </div>

        <figure className="overflow-hidden border border-pp-border/24 bg-pp-page shadow-2xl">
          <div className="flex min-h-13 items-center gap-3 border-b border-pp-border/18 bg-pp-surface/92 px-5">
            <span className="h-1.5 w-1.5 rounded-full bg-pp-live shadow-glow-live"/>
            <strong className="text-xs font-semibold">Perfect Property decision sequence</strong>
            <span className="ml-auto font-mono text-xs uppercase tracking-widest text-pp-faint">18 seconds · No audio</span>
          </div>
          <div className="relative aspect-video bg-pp-page">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              poster="/perfect-property-motion-poster.png"
              muted
              loop
              playsInline
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => void trackProductEvent('media_error', {
                properties: { media: 'product_walkthrough' },
                onceKey: 'product-walkthrough-media-error',
              })}
              aria-label="Animated Perfect Property workflow from market signal through evidence and underwriting action"
            >
              <source src="/perfect-property-motion.webm" type="video/webm"/>
              <source src="/perfect-property-motion.mp4" type="video/mp4"/>
            </video>
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={isPlaying ? 'Pause product walkthrough' : 'Play product walkthrough'}
              className="absolute bottom-4 right-4 flex h-10 items-center gap-2 border border-pp-border/30 bg-pp-surface/92 px-4 text-xs font-semibold text-pp-text shadow-lg backdrop-blur-md transition-colors hover:border-pp-gold/60 hover:text-pp-gold-bright max-sm:bottom-2 max-sm:right-2 max-sm:h-9 max-sm:px-3"
            >
              {isPlaying ? <Pause size={15} weight="fill"/> : <Play size={15} weight="fill"/>}
              <span className="max-sm:hidden">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          </div>
          <figcaption className="grid grid-cols-3 divide-x divide-pp-border/14 border-t border-pp-border/18 bg-pp-surface max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y">
            {[
              ['01', 'Market signal', 'Rank calibrated opportunity'],
              ['02', 'Source evidence', 'Trace every score'],
              ['03', 'Underwriting action', 'Move into diligence'],
            ].map(([index, title, copy]) => (
              <div key={index} data-motion-stage className="grid grid-cols-[36px_1fr] gap-3 px-6 py-5 max-md:py-4">
                <span className="font-mono text-xs text-pp-gold">{index}</span>
                <span><strong className="block text-sm">{title}</strong><small className="mt-1 block text-xs text-pp-faint">{copy}</small></span>
              </div>
            ))}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function ProductPreview({ onExplore, live, liveLoading, mapParcels }: {
  onExplore: () => void
  live: null | {
    count: number
    topScore: number
    coverage: string
    topMarkets: Array<{ id: string; address: string; marketLabel: string; score: number }>
    snapshotIso: string | null
  }
  liveLoading?: boolean
  mapParcels: MapParcel[]
}) {
  const [selectedParcel, setSelectedParcel] = useState<string | null>(null)

  const exportPreview = () => {
    const rows = live && live.topMarkets.length
      ? [
          ['Address', 'Market', 'Perfect score'],
          ...live.topMarkets.map((m) => [m.address, m.marketLabel, m.score.toFixed(1)]),
        ]
      : [
          ['Market', 'Opportunity score'],
          ...portfolio.topMarkets.map((m) => [`${m.name}, ${m.state}`, m.score.toFixed(1)]),
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
    <article id="workflow" className="overflow-hidden border border-pp-border/18 bg-gradient-to-br from-pp-header to-pp-page shadow-md">
      {/* Header */}
      <div className="flex h-13 items-center border-b border-pp-border/18 px-5 backdrop-blur-sm">
        <Brand compact/>
        <strong className="ml-4 text-md font-semibold tracking-tight text-pp-text">Market overview</strong>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-pp-muted">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pp-live"/>{live ? 'Live scores' : 'Coverage map'}
          </span>
          <time className="grid h-8 place-items-center rounded-md border border-pp-border/20 bg-pp-surface-soft/60 px-3 font-mono text-xs text-pp-muted max-sm:hidden" dateTime={live?.snapshotIso ?? portfolio.snapshotIso}>{formatShortDate(live?.snapshotIso ?? portfolio.snapshotIso)}</time>
          <button type="button" onClick={exportPreview} className="h-8 rounded-md border border-pp-border/20 bg-pp-surface-soft/60 px-3 text-xs text-pp-muted transition-all hover:border-pp-border/40 hover:bg-pp-surface-raised active:scale-95 max-sm:hidden">Export</button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="grid min-h-[400px] grid-cols-[140px_minmax(0,1fr)] max-sm:grid-cols-1">
        <div className="border-r border-pp-border/18 bg-pp-surface p-3 max-sm:hidden">
          {[[MapTrifold,'Market map',true],[Target,'Deal pipeline',false],[ChartLineUp,'Predictions',false],[Database,'Sources',false]].map(([Icon,label,enabled])=>{
            const IconComponent=Icon as typeof MapTrifold;
            const isActive = Boolean(enabled);
            return (
              <button type="button" onClick={isActive ? onExplore : undefined} key={label as string} aria-current={isActive ? 'page' : undefined} disabled={!isActive} aria-disabled={!isActive} title={isActive ? undefined : `${label as string} available in workspace`} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-xs font-medium transition-all ${isActive ? 'border-l-2 border-pp-gold bg-pp-gold/[.08] text-pp-text shadow-sm shadow-pp-gold/20' : 'cursor-not-allowed text-pp-faint/70 opacity-60'}`}>
                <IconComponent size={15} weight={isActive ? 'fill' : 'regular'}/>
                <span>{label as string}</span>
              </button>
            )
          })}
        </div>

        {/* Content area */}
        <div className="p-5 flex flex-col gap-5">
          {/* KPI strip — divided cells instead of card boxes (anti-card-overuse) */}
          <div id="models" className="scroll-mt-24 grid grid-cols-4 divide-x divide-y-0 divide-pp-border/18 border-y border-pp-border/18 max-md:grid-cols-2 max-md:divide-x-0 max-md:divide-y">
            {((live
              ? [
                  ['Live parcels', String(live.count), live.coverage],
                  ['Top score', live.topScore.toFixed(1), 'Perfect score'],
                  ['Coverage', live.coverage, 'States'],
                  ['Feed', liveLoading ? 'Loading' : 'LIVE', 'parcel_scores'],
                ]
              : [
                  ['Coverage metros', String(portfolio.marketCount), portfolio.coverage],
                  ['Sign in', 'Required', 'For live ranks'],
                  ['Footprint', portfolio.topScore.toFixed(1), 'Reference'],
                  ['Sources', String(portfolio.sourceFamilyCount), 'Pipeline'],
                ]
            ) as Array<[string, string, string]>).map(([label, value, change]) =>
              <div key={label} className="group px-4 py-3 transition-colors hover:bg-pp-surface-soft/50 max-md:px-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-pp-muted group-hover:text-pp-muted">{label}</span>
                <strong className="mt-2 block font-mono text-2xl font-bold text-pp-text">{value}</strong>
                <small className={`mt-1.5 block font-mono text-xs font-semibold ${change.startsWith('+')?'text-profit-strong':'text-pp-muted'}`}>{change}</small>
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
              className="relative min-h-[280px] overflow-hidden rounded-lg border border-pp-border/18 bg-pp-surface shadow-xs"
            >
              <div className="absolute top-3 left-4 z-10">
                <p className="text-xs font-semibold text-pp-text tracking-tight">{live ? "Live parcel map" : "Coverage footprint"}</p>
                <p className="text-xs text-pp-faint mt-1">{live ? "LIVE perfect scores" : "Illustrative metro coverage — sign in for live ranks"}</p>
              </div>
              <PreviewMap
                parcels={mapParcels}
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
              className="rounded-lg border border-pp-border/18 bg-pp-surface p-4 overflow-y-auto"
            >
              <p className="text-xs font-semibold text-pp-text tracking-tight mb-3">{live ? 'Top live parcels' : 'Coverage metros'}</p>
              <div className="space-y-2.5">
                {(live?.topMarkets?.length
                  ? live.topMarkets
                  : portfolio.topMarkets.map((m) => ({
                      id: m.id,
                      address: `${m.name}, ${m.state}`,
                      marketLabel: `${m.name}, ${m.state}`,
                      score: m.score,
                    }))
                ).map((m, index) => {
                  const width = `${Math.min(100, Math.round(m.score))}%`
                  return (
                    <div key={m.id} className="group">
                      <div className="grid grid-cols-[20px_1fr_auto] items-center gap-2 text-xs pb-2.5 border-b border-pp-border/12 last:border-0">
                        <span className="font-mono font-semibold text-pp-gold text-xs">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="text-pp-text font-medium truncate group-hover:text-pp-gold transition-colors">{m.address}</div>
                          {live ? <div className="text-pp-faint truncate">{m.marketLabel}</div> : null}
                          <div className="mt-1.5 h-1 rounded-full bg-pp-border/20 overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-pp-gold to-pp-gold-bright rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width }}
                              transition={{ delay: 0.3 + index * 0.1, duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                        <strong className="font-mono font-semibold text-pp-gold text-xs whitespace-nowrap">{m.score.toFixed(1)}</strong>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <button 
        type="button" 
        onClick={onExplore} 
        className="flex h-12 w-full items-center justify-center gap-2 border-t border-pp-border/18 bg-gradient-to-r from-pp-surface-soft to-pp-surface-soft text-xs font-semibold text-pp-gold transition-all hover:from-pp-surface-raised hover:to-pp-surface-raised hover:text-pp-gold-bright active:scale-98 group"
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
  return <div className="h-full w-full bg-[radial-gradient(circle_at_34%_44%,var(--pp-blue-strong),transparent_54%),var(--pp-surface)]" aria-hidden="true" />
}
