import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsOut, Crosshair, Eye, EyeSlash, MagnifyingGlass, Minus, Plus, Stack } from '@phosphor-icons/react'
import type { LayerMode, Market, PropertyFilter, RegionFilter } from '../data'

type Props = {
  markets: Market[]
  selected: Market | null
  onSelect: (market: Market) => void
  region: RegionFilter
  propertyType: PropertyFilter
  onRegionChange: (region: RegionFilter) => void
  onPropertyTypeChange: (type: PropertyFilter) => void
  layer: LayerMode
  onLayerChange: (layer: LayerMode) => void
}

const layerModes: LayerMode[] = ['Opportunity score', 'Rent growth', 'Supply pressure', 'Insurance risk']
const defaultView = () => ({ center: [-99.2, 33.2] as [number, number], zoom: window.innerWidth < 640 ? 2.4 : 3.25 })

function metricValue(market: Market, layer: LayerMode) {
  if (layer === 'Rent growth') return market.rent
  if (layer === 'Supply pressure') return market.supply
  if (layer === 'Insurance risk') return 100 - market.insurance
  return market.score
}

function toGeoJSON(markets: Market[], layer: LayerMode): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: markets.map((market) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: market.coordinates },
      properties: { id: market.id, name: `${market.name}, ${market.state}`, score: market.score, count: market.opportunities, metric: metricValue(market, layer) },
    })),
  }
}

export function MapCanvas(props: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const marketsRef = useRef(props.markets)
  const onSelectRef = useRef(props.onSelect)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [layersOpen, setLayersOpen] = useState(false)
  const data = useMemo(() => toGeoJSON(props.markets, props.layer), [props.markets, props.layer])
  const initialDataRef = useRef(data)

  useEffect(() => { marketsRef.current = props.markets }, [props.markets])
  useEffect(() => { onSelectRef.current = props.onSelect }, [props.onSelect])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const initialView = defaultView()
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: initialView.center, zoom: initialView.zoom, minZoom: 2.2, maxZoom: 15,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 90 }), 'bottom-left')

    map.on('styleimagemissing', ({ id }) => {
      if (map.hasImage(id)) return
      const size = 16
      const pixels = new Uint8Array(size * size * 4)
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const distance = Math.hypot(x - 7.5, y - 7.5)
        const alpha = distance < 4.5 ? 92 : distance < 6 ? 34 : 0
        const offset = (y * size + x) * 4
        pixels[offset] = 190; pixels[offset + 1] = 196; pixels[offset + 2] = 190; pixels[offset + 3] = alpha
      }
      map.addImage(id, { width: size, height: size, data: pixels })
    })

    map.on('load', () => {
      map.addSource('markets', {
        type: 'geojson', data: initialDataRef.current, cluster: true, clusterMaxZoom: 8, clusterRadius: 42,
        clusterProperties: { opportunity_sum: ['+', ['get', 'count']] },
      })
      map.addLayer({ id: 'market-clusters', type: 'circle', source: 'markets', filter: ['has', 'point_count'], paint: { 'circle-color': '#efaa2d', 'circle-radius': ['step', ['get', 'opportunity_sum'], 17, 35, 21, 70, 25], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffd16f', 'circle-opacity': .9 } })
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'markets', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'opportunity_sum'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 }, paint: { 'text-color': '#111616' } })
      map.addLayer({ id: 'market-points', type: 'circle', source: 'markets', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['interpolate', ['linear'], ['get', 'metric'], 0, '#40515d', 65, '#a47728', 100, '#efaa2d'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 11], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffd16f', 'circle-opacity': .96 } })
      map.addLayer({ id: 'selected-halo', type: 'circle', source: 'markets', filter: ['==', ['get', 'id'], ''], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 20, 'circle-stroke-width': 2, 'circle-stroke-color': '#efaa2d', 'circle-stroke-opacity': .78 } })
      map.addLayer({ id: 'market-labels', type: 'symbol', source: 'markets', filter: ['!', ['has', 'point_count']], minzoom: 4.3, layout: { 'text-field': ['get', 'name'], 'text-offset': [0, 1.25], 'text-size': 11, 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#e7edf1', 'text-halo-color': '#02080d', 'text-halo-width': 1.2 } })
      setStatus('ready')
    })

    map.on('click', 'market-clusters', async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ['market-clusters'] })[0]
      const clusterId = feature?.properties?.cluster_id
      if (clusterId == null) return
      const source = map.getSource('markets') as GeoJSONSource
      const zoom = await source.getClusterExpansionZoom(clusterId)
      map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom, duration: 850 })
    })
    map.on('click', 'market-points', (event) => {
      const feature = event.features?.[0]
      const market = marketsRef.current.find((item) => item.id === feature?.properties?.id)
      if (market) onSelectRef.current(market)
    })
    map.on('mouseenter', 'market-points', (event) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined
      if (!feature || feature.geometry.type !== 'Point') return
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'market-popup' })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(`<strong>${feature.properties.name}</strong><span>${Number(feature.properties.score).toFixed(1)} opportunity score</span>`).addTo(map)
    })
    map.on('mouseleave', 'market-points', () => { map.getCanvas().style.cursor = ''; popupRef.current?.remove() })
    map.on('error', () => { if (!map.loaded()) setStatus('error') })
    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('markets')) return
    ;(map.getSource('markets') as GeoJSONSource).setData(data)
  }, [data])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.selected || !map.getLayer('selected-halo')) return
    map.setFilter('selected-halo', ['==', ['get', 'id'], props.selected.id])
    map.easeTo({ center: props.selected.coordinates, zoom: Math.max(map.getZoom(), 5.1), duration: 1000, essential: true })
  }, [props.selected])

  const zoom = (amount: number) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 4) + amount, duration: 350 })

  return (
    <section className="relative min-h-0 overflow-hidden bg-[#020a10]">
      <div ref={mapContainer} className="maplibre-map-container absolute inset-0" aria-label="Interactive opportunity map"/>
      <div className="map-color-wash pointer-events-none absolute inset-0 z-[1]"/>
      <div className="absolute inset-x-0 top-0 z-[2] flex flex-wrap items-center gap-2 border-b border-[#7893a5]/18 bg-[#031019]/94 p-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,.014)] backdrop-blur-md">
        {(['All markets', 'California', 'Florida'] as RegionFilter[]).map((item) => <FilterButton key={item} active={props.region === item} onClick={() => props.onRegionChange(item)}>{item}</FilterButton>)}
        <span className="mx-1 h-6 w-px bg-white/10"/>
        {(['All types', 'Multifamily', 'Build-to-rent', 'Office'] as PropertyFilter[]).map((item) => <FilterButton key={item} active={props.propertyType === item} onClick={() => props.onPropertyTypeChange(item)}>{item}</FilterButton>)}
        <button type="button" className="filter-button ml-auto max-lg:hidden">May 12, 2024</button>
      </div>

      <div className="absolute left-3 top-20 z-[2] grid gap-1 rounded-[5px] border border-[#7893a5]/24 bg-[#06131c]/95 p-1 shadow-[0_12px_34px_rgba(0,5,9,.28),inset_0_1px_0_rgba(255,255,255,.045)]">
        <MapButton label="Zoom in" onClick={() => zoom(1)}><Plus size={18}/></MapButton><MapButton label="Zoom out" onClick={() => zoom(-1)}><Minus size={18}/></MapButton>
        <MapButton label="Reset view" onClick={() => mapRef.current?.easeTo({ ...defaultView(), duration: 900 })}><Crosshair size={18}/></MapButton>
        <MapButton label="Fullscreen" onClick={() => mapContainer.current?.requestFullscreen()}><ArrowsOut size={18}/></MapButton>
      </div>

      <div className="absolute right-3 top-20 z-[2] w-[210px]">
        <button type="button" className="control-button w-full justify-between" onClick={() => setLayersOpen((open) => !open)}><span className="flex items-center gap-2"><Stack size={17} className="text-[#efaa2d]"/>{props.layer}</span></button>
        <AnimatePresence>{layersOpen && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{type:'spring',stiffness:210,damping:24}} className="mt-1 overflow-hidden rounded-[5px] border border-[#7893a5]/24 bg-[#06131c]/96 p-1 shadow-[0_18px_48px_rgba(0,5,9,.42),inset_0_1px_0_rgba(255,255,255,.045)] backdrop-blur-md">{layerModes.map((mode) => <button key={mode} onClick={() => { props.onLayerChange(mode); setLayersOpen(false) }} type="button" className={`flex w-full items-center gap-2 rounded-[3px] px-3 py-2 text-left text-[12px] ${mode === props.layer ? 'bg-[#efaa2d]/10 text-[#efaa2d]' : 'text-[#98a8b2] hover:bg-[#7aa0b8]/[.06]'}`}>{mode === props.layer ? <Eye size={15}/> : <EyeSlash size={15}/>} {mode}</button>)}</motion.div>}</AnimatePresence>
      </div>

      <div className="absolute bottom-7 left-3 z-[2] w-[166px] border border-[#7893a5]/24 bg-[#06131c]/94 p-3 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-md"><div className="mb-2 font-medium text-[#e7edf1]">{props.layer}</div>{[[80,'Excellent'],[60,'Strong'],[40,'Moderate'],[20,'Weak']].map(([value,label]) => <div key={label} className="flex items-center gap-2 py-1 text-[#93a4ae]"><i className="h-2.5 w-2.5 rounded-full" style={{background:Number(value)>=80?'#efaa2d':Number(value)>=60?'#a97828':Number(value)>=40?'#607482':'#34434d'}}/><span>{value}+</span><span className="ml-auto">{label}</span></div>)}</div>
      <div className="absolute bottom-2 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-2 border border-[#7893a5]/20 bg-[#06131c]/92 px-4 py-2 text-[11px] text-[#81939e] backdrop-blur-md max-sm:hidden"><MagnifyingGlass size={15}/>Press <kbd className="border border-[#7893a5]/18 px-1 font-mono">⌘K</kbd> to search or type a command…</div>

      {status === 'loading' && <div className="absolute inset-0 z-[3] grid place-items-center bg-[#030b11]"><div className="w-[320px] space-y-3"><div className="skeleton h-4 w-2/3"/><div className="skeleton h-4 w-full"/><div className="skeleton h-4 w-4/5"/></div></div>}
      {status === 'error' && <div className="absolute inset-0 z-[3] grid place-items-center bg-[#030b11] p-8 text-center"><div><p className="font-medium">Map tiles could not be loaded.</p><p className="mt-2 text-sm text-[#80919c]">Check the network connection, then reload the workspace.</p></div></div>}
      {status === 'ready' && props.markets.length === 0 && <div className="absolute inset-0 z-[3] grid place-items-center bg-[#030b11]/90 p-8 text-center"><div><p className="font-medium">No calibrated markets match these filters.</p><p className="mt-2 text-sm text-[#80919c]">Change the property type or expand the region.</p></div></div>}
    </section>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <motion.button layout whileTap={{ scale: .97 }} type="button" onClick={onClick} className={`filter-button ${active ? 'active-filter' : ''}`}>{children}</motion.button> }
function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) { return <button aria-label={label} title={label} onClick={onClick} type="button" className="grid h-8 w-8 place-items-center rounded-[3px] text-[#c7cdca] hover:bg-white/[.06] active:translate-y-px">{children}</button> }

