import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Rider } from './types'
import { dayColors, riderMapColor } from './colors'

const KEY = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim()

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function baseStyle(): maplibregl.StyleSpecification | string {
  if (KEY) return `https://api.maptiler.com/maps/satellite/style.json?key=${KEY}`
  // Keyless fallback: Esri World Imagery raster tiles.
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  }
}

function demSource(): maplibregl.RasterDEMSourceSpecification {
  if (KEY) {
    return {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,
    }
  }
  // Keyless fallback: AWS Terrain Tiles (terrarium encoding).
  return {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 13,
    attribution: 'Terrain: Mapzen/AWS',
  }
}

export class MapView {
  readonly map: maplibregl.Map
  private dayMarkers: maplibregl.Marker[] = []
  private puck: maplibregl.Marker
  private terrainOn = true
  onDayClick: ((day: number) => void) | null = null

  constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: baseStyle(),
      center: [-4.7, 58.0],
      zoom: 6.2,
      pitch: 0,
      maxPitch: 75,
      attributionControl: false,
    })
    // The elevation ribbon owns the bottom edge, so map chrome lives top-right.
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    const puckEl = document.createElement('div')
    puckEl.className = 'puck'
    this.puck = new maplibregl.Marker({ element: puckEl })

    this.map.on('load', () => {
      this.map.addSource('dem', demSource())
      this.enableTerrain(true)
      try {
        this.map.setSky({
          'sky-color': '#0b1622',
          'horizon-color': '#25333d',
          'fog-color': '#141c22',
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.6,
          'fog-ground-blend': 0.85,
        })
      } catch {
        /* sky is cosmetic — fine without it */
      }
    })
  }

  whenLoaded(): Promise<void> {
    return new Promise((resolve) => {
      if (this.map.loaded()) resolve()
      else this.map.once('load', () => resolve())
    })
  }

  enableTerrain(on: boolean): void {
    this.terrainOn = on
    this.map.setTerrain(on ? { source: 'dem', exaggeration: 1.35 } : null)
    if (!on && this.map.getPitch() > 0) this.map.easeTo({ pitch: 0, duration: 600 })
  }

  get terrainEnabled(): boolean {
    return this.terrainOn
  }

  /** Add or refresh one rider's route layers. */
  syncRider(rider: Rider, focused: boolean): void {
    const id = rider.manifest.id
    const srcId = `route-${id}`
    const src = this.map.getSource(srcId) as maplibregl.GeoJSONSource | undefined
    if (!src) {
      this.map.addSource(srcId, { type: 'geojson', data: rider.geojson })
      this.map.addLayer({
        id: `${srcId}-casing`,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': 'rgba(5,8,10,0.65)', 'line-width': 7 },
      })
      this.map.addLayer({
        id: `${srcId}-line`,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 3.5 },
      })
    }

    const visibility = rider.visible ? 'visible' : 'none'
    this.map.setLayoutProperty(`${srcId}-casing`, 'visibility', visibility)
    this.map.setLayoutProperty(`${srcId}-line`, 'visibility', visibility)

    if (focused) {
      const colors = dayColors(rider.manifest.totals.days)
      const match: unknown[] = ['match', ['get', 'day']]
      colors.forEach((c, i) => match.push(i + 1, c))
      match.push('#ffffff')
      this.map.setPaintProperty(`${srcId}-line`, 'line-color', match as never)
      this.map.setPaintProperty(`${srcId}-line`, 'line-width', 4)
      this.map.setPaintProperty(`${srcId}-line`, 'line-opacity', 1)
      this.map.setPaintProperty(`${srcId}-casing`, 'line-width', 8)
      this.map.moveLayer(`${srcId}-casing`)
      this.map.moveLayer(`${srcId}-line`)
    } else {
      this.map.setPaintProperty(`${srcId}-line`, 'line-color', riderMapColor(rider.colorIdx))
      this.map.setPaintProperty(`${srcId}-line`, 'line-width', 2.5)
      this.map.setPaintProperty(`${srcId}-line`, 'line-opacity', 0.9)
      this.map.setPaintProperty(`${srcId}-casing`, 'line-width', 5)
    }
  }

  /** Numbered start-of-day markers for the focused rider. */
  setDayMarkers(rider: Rider): void {
    this.dayMarkers.forEach((m) => m.remove())
    this.dayMarkers = []
    const colors = dayColors(rider.manifest.totals.days)
    for (const feature of rider.geojson.features) {
      const day = feature.properties.day
      const [lng, lat] = feature.geometry.coordinates[0]
      const el = document.createElement('button')
      el.className = 'day-marker'
      el.style.background = colors[day - 1]
      el.textContent = String(day)
      el.title = `Day ${day} — ${feature.properties.label}`
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.onDayClick?.(day)
      })
      this.dayMarkers.push(
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(this.map),
      )
    }
  }

  flyToBounds(bounds: [number, number, number, number], opts: { intro?: boolean } = {}): void {
    const b = new maplibregl.LngLatBounds([bounds[0], bounds[1]], [bounds[2], bounds[3]])
    const padding = { top: 90, bottom: 60, left: 320, right: 60 }
    if (REDUCED_MOTION) {
      this.map.fitBounds(b, { padding, pitch: 0, duration: 0 })
      return
    }
    this.map.fitBounds(b, {
      padding,
      pitch: opts.intro ? 48 : this.map.getPitch(),
      bearing: opts.intro ? -12 : this.map.getBearing(),
      duration: opts.intro ? 3200 : 1200,
      essential: false,
    })
  }

  flyToDay(rider: Rider, day: number): void {
    const feature = rider.geojson.features.find((f) => f.properties.day === day)
    if (!feature) return
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of feature.geometry.coordinates) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
    this.flyToBounds([minLng, minLat, maxLng, maxLat])
  }

  showPuck(lng: number, lat: number): void {
    this.puck.setLngLat([lng, lat]).addTo(this.map)
  }

  hidePuck(): void {
    this.puck.remove()
  }
}
