import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsOut, Crosshair, Eye, EyeSlash, MagnifyingGlass, Minus, Plus, Stack } from '@phosphor-icons/react'
import type { LiveLayerMode, LiveRegionFilter, WorkspaceParcel } from '../live'
import { layerMetric } from '../live'
import { formatShortDate } from '../data'
import { useIsMac } from '@/hooks/use-is-mac'

type Props = {
  parcels: WorkspaceParcel[]
  selected: WorkspaceParcel | null
  onSelect: (parcel: WorkspaceParcel) => void
  region: LiveRegionFilter
  onRegionChange: (region: LiveRegionFilter) => void
  layer: LiveLayerMode
  onLayerChange: (layer: LiveLayerMode) => void
  snapshotIso: string | null
  loading?: boolean
  isRefreshing?: boolean
  error?: string | null
  onRetry?: () => void
  /** Total unfiltered live parcels (before region filter) */
  totalCount?: number
  onOpenDeals?: () => void
  onOpenAdmin?: () => void
}

const layerModes: LiveLayerMode[] = ['Opportunity score', 'Expected profit', 'Loss risk', 'Deal odds']
const defaultView = () => ({ center: [-99.2, 33.2] as [number, number], zoom: window.innerWidth < 640 ? 2.4 : 3.25 })

function toGeoJSON(parcels: WorkspaceParcel[], layer: LiveLayerMode): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: parcels.map((parcel) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: parcel.coordinates },
      properties: {
        id: parcel.id,
        name: parcel.address,
        market: parcel.marketLabel,
        score: parcel.score,
        metric: layerMetric(parcel, layer),
      },
    })),
  }
}

export function MapCanvas(props: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const parcelsRef = useRef(props.parcels)
  const onSelectRef = useRef(props.onSelect)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [layersOpen, setLayersOpen] = useState(false)
  const isMac = useIsMac()
  const data = useMemo(() => toGeoJSON(props.parcels, props.layer), [props.parcels, props.layer])
  const initialDataRef = useRef(data)

  useEffect(() => {
    parcelsRef.current = props.parcels
  }, [props.parcels])
  useEffect(() => {
    onSelectRef.current = props.onSelect
  }, [props.onSelect])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    let mounted = true
    const initialView = defaultView()
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: initialView.center,
      zoom: initialView.zoom,
      minZoom: 2.2,
      maxZoom: 15,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 90 }), 'bottom-left')

    map.on('styleimagemissing', ({ id }) => {
      if (map.hasImage(id)) return
      const size = 16
      const pixels = new Uint8Array(size * size * 4)
      for (let y = 0; y < size; y += 1)
        for (let x = 0; x < size; x += 1) {
          const distance = Math.hypot(x - 7.5, y - 7.5)
          const alpha = distance < 4.5 ? 92 : distance < 6 ? 34 : 0
          const offset = (y * size + x) * 4
          pixels[offset] = 190
          pixels[offset + 1] = 196
          pixels[offset + 2] = 190
          pixels[offset + 3] = alpha
        }
      map.addImage(id, { width: size, height: size, data: pixels })
    })

    map.on('load', () => {
      map.addSource('parcels', {
        type: 'geojson',
        data: initialDataRef.current,
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 42,
        clusterProperties: { score_sum: ['+', ['get', 'score']], point_count_score: ['+', 1] },
      })
      map.addLayer({
        id: 'parcel-clusters',
        type: 'circle',
        source: 'parcels',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#efaa2d',
          'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 30, 25],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffd16f',
          'circle-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'parcels',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#111616' },
      })
      map.addLayer({
        id: 'parcel-points',
        type: 'circle',
        source: 'parcels',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'metric'],
            0,
            '#40515d',
            50,
            '#a47728',
            100,
            '#efaa2d',
          ],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 10],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffd16f',
          'circle-opacity': 0.96,
        },
      })
      map.addLayer({
        id: 'selected-halo',
        type: 'circle',
        source: 'parcels',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': 18,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#efaa2d',
          'circle-stroke-opacity': 0.78,
        },
      })
      map.addLayer({
        id: 'parcel-labels',
        type: 'symbol',
        source: 'parcels',
        filter: ['!', ['has', 'point_count']],
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-offset': [0, 1.2],
          'text-size': 10,
          'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#e7edf1', 'text-halo-color': '#02080d', 'text-halo-width': 1.2 },
      })
      if (mounted) setStatus('ready')
    })

    map.on('click', 'parcel-clusters', async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ['parcel-clusters'] })[0]
      const clusterId = feature?.properties?.cluster_id
      if (clusterId == null) return
      const source = map.getSource('parcels') as GeoJSONSource
      const zoom = await source.getClusterExpansionZoom(clusterId)
      map.easeTo({
        center: (feature.geometry as Point).coordinates as [number, number],
        zoom,
        duration: 850,
      })
    })
    map.on('click', 'parcel-points', (event) => {
      const feature = event.features?.[0]
      const parcel = parcelsRef.current.find((item) => item.id === feature?.properties?.id)
      if (parcel) onSelectRef.current(parcel)
    })
    map.on('mouseenter', 'parcel-points', (event) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined
      if (!feature || feature.geometry.type !== 'Point') return
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: 'market-popup',
      })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(
          `<strong>${feature.properties.name}</strong><span>${Number(feature.properties.score).toFixed(1)} perfect score · ${feature.properties.market ?? ''}</span>`,
        )
        .addTo(map)
    })
    map.on('mouseleave', 'parcel-points', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })
    map.on('error', () => {
      if (mounted && !map.loaded()) setStatus('error')
    })
    return () => {
      mounted = false
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('parcels')) return
    ;(map.getSource('parcels') as GeoJSONSource).setData(data)
  }, [data])

  const prevSelectedId = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.selected || !map.getLayer('selected-halo')) return
    map.setFilter('selected-halo', ['==', ['get', 'id'], props.selected.id])
    const id = props.selected.id
    const shouldFly = prevSelectedId.current != null && prevSelectedId.current !== id
    prevSelectedId.current = id
    if (!shouldFly) return
    map.easeTo({
      center: props.selected.coordinates,
      zoom: Math.max(map.getZoom(), 11),
      duration: 700,
      essential: true,
    })
  }, [props.selected])

  const zoom = (amount: number) =>
    mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 4) + amount, duration: 350 })

  const mapBusy = (props.loading && status !== 'ready') || status === 'loading'

  return (
    <section className="relative min-h-0 overflow-hidden bg-pp-header">
      <div ref={mapContainer} className="maplibre-map-container absolute inset-0" aria-label="Interactive opportunity map" />
      <div className="map-color-wash pointer-events-none absolute inset-0 z-[1]" />
      <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 border-b border-pp-border/18 bg-pp-header/94 p-2.5 shadow-inset-border backdrop-blur-md">
        {(['All regions', 'California', 'Florida'] as LiveRegionFilter[]).map((item) => (
          <FilterButton key={item} active={props.region === item} onClick={() => props.onRegionChange(item)}>
            {item}
          </FilterButton>
        ))}
        <span className="mx-1 h-6 w-px bg-white/10" />
        {props.isRefreshing ? (
          <span className="filter-button ml-auto inline-flex items-center gap-2 max-lg:hidden text-pp-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pp-gold" />
            Refreshing…
          </span>
        ) : props.snapshotIso ? (
          <time
            dateTime={props.snapshotIso}
            aria-label={`Data snapshot ${formatShortDate(props.snapshotIso)}`}
            className="filter-button ml-auto inline-flex items-center max-lg:hidden"
          >
            {formatShortDate(props.snapshotIso)}
          </time>
        ) : (
          <span className="filter-button ml-auto inline-flex items-center max-lg:hidden text-pp-faint">No snapshot</span>
        )}
      </div>

      <div className="absolute left-3 top-20 z-20 grid gap-1 rounded-md border border-pp-border/18 bg-pp-surface/95 p-1 shadow-map-controls">
        <MapButton label="Zoom in" onClick={() => zoom(1)}>
          <Plus size={18} />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoom(-1)}>
          <Minus size={18} />
        </MapButton>
        <MapButton label="Reset view" onClick={() => mapRef.current?.easeTo({ ...defaultView(), duration: 900 })}>
          <Crosshair size={18} />
        </MapButton>
        <MapButton label="Fullscreen" onClick={() => mapContainer.current?.requestFullscreen()}>
          <ArrowsOut size={18} />
        </MapButton>
      </div>

      <div className="absolute right-3 top-20 z-20 w-[210px] max-sm:right-6">
        <button
          type="button"
          className="control-button w-full justify-between"
          aria-expanded={layersOpen}
          aria-controls="map-layer-options"
          onClick={() => setLayersOpen((open) => !open)}
        >
          <span className="flex items-center gap-2">
            <Stack size={17} className="text-pp-gold" />
            {props.layer}
          </span>
        </button>
        <AnimatePresence>
          {layersOpen && (
            <motion.div
              id="map-layer-options"
              aria-label="Map data layers"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 210, damping: 24 }}
              className="mt-1 overflow-hidden rounded-md border border-pp-border/18 bg-pp-surface/96 p-1 shadow-map-panel backdrop-blur-md"
            >
              {layerModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    props.onLayerChange(mode)
                    setLayersOpen(false)
                  }}
                  type="button"
                  aria-pressed={mode === props.layer}
                  className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm ${
                    mode === props.layer ? 'bg-pp-gold/10 text-pp-gold' : 'text-pp-muted hover:bg-pp-border/[.07]'
                  }`}
                >
                  {mode === props.layer ? <Eye size={15} /> : <EyeSlash size={15} />} {mode}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-7 left-3 z-20 w-[166px] border border-pp-border/18 bg-pp-surface/94 p-3 text-xs shadow-xs backdrop-blur-md">
        <div className="mb-2 font-medium text-pp-text">{props.layer}</div>
        {[
          [80, 'Excellent'],
          [60, 'Strong'],
          [40, 'Moderate'],
          [20, 'Weak'],
        ].map(([value, label]) => (
          <div key={label as string} className="flex items-center gap-2 py-1 text-pp-muted">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background:
                  Number(value) >= 80
                    ? 'var(--pp-gold)'
                    : Number(value) >= 60
                      ? 'var(--pp-tier-strong)'
                      : Number(value) >= 40
                        ? 'var(--pp-tier-moderate)'
                        : 'var(--pp-tier-weak)',
              }}
            />
            <span>{value}+</span>
            <span className="ml-auto">{label}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 border border-pp-border/18 bg-pp-surface/92 px-4 py-2 text-xs text-pp-muted backdrop-blur-md max-sm:hidden">
        <MagnifyingGlass size={15} />
        Press <kbd className="border border-pp-border/18 px-1 font-mono">{isMac ? '⌘K' : 'Ctrl K'}</kbd> to search parcels…
      </div>

      {mapBusy && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-pp-page/80" aria-live="polite" aria-busy="true">
          <div className="w-[320px] space-y-3">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-4/5" />
          </div>
        </div>
      )}
      {(status === 'error' || props.error) && !mapBusy && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-pp-page p-8 text-center">
          <div>
            <p className="font-medium">Live parcel data could not be loaded.</p>
            <p className="mt-2 text-sm text-pp-muted">{props.error ?? 'Check the network connection, then try again.'}</p>
            {props.onRetry ? (
              <button type="button" className="primary-button mt-4 mx-auto" onClick={props.onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        </div>
      )}
      {status === 'ready' && !props.loading && props.parcels.length === 0 && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-pp-page/90 p-8 text-center">
          <div className="max-w-md">
            {(props.totalCount ?? 0) === 0 ? (
              <>
                <p className="font-medium text-pp-text">No LIVE scored parcels yet</p>
                <p className="mt-2 text-sm text-pp-muted">
                  The workspace reads <span className="font-mono text-pp-faint">parcel_scores</span> with{' '}
                  <span className="font-mono text-pp-faint">data_source=LIVE</span>. Ingest counties and run underwriting to populate this map.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {props.onOpenDeals ? (
                    <button type="button" className="primary-button" onClick={props.onOpenDeals}>
                      Open ranked deals
                    </button>
                  ) : null}
                  {props.onOpenAdmin ? (
                    <button type="button" className="control-button" onClick={props.onOpenAdmin}>
                      Open admin pipeline
                    </button>
                  ) : null}
                  {props.onRetry ? (
                    <button type="button" className="control-button" onClick={props.onRetry}>
                      Refresh
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="font-medium text-pp-text">No parcels in this region</p>
                <p className="mt-2 text-sm text-pp-muted">
                  {(props.totalCount ?? 0).toLocaleString()} live parcels loaded — try All regions or switch state filter.
                </p>
                {props.onOpenDeals ? (
                  <button type="button" className="primary-button mt-4 mx-auto" onClick={props.onOpenDeals}>
                    Open ranked deals
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.97 }}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`filter-button ${active ? 'active-filter' : ''}`}
    >
      {children}
    </motion.button>
  )
}
function MapButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      type="button"
      className="grid h-8 w-8 place-items-center rounded-sm text-pp-muted hover:bg-white/6 active:translate-y-px"
    >
      {children}
    </button>
  )
}