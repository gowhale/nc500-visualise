import './style.css'
import type { Manifest, ProfileRow, Rider, RouteFeatureCollection } from './types'
import { riderColor } from './colors'
import { fmtDate, fmtDuration, fmtKm, fmtM } from './format'
import { MapView } from './mapview'
import { ElevationRibbon } from './elevation'
import { Flythrough } from './flythrough'

const BASE = import.meta.env.BASE_URL
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = {
  map: document.getElementById('map')!,
  brandSub: document.getElementById('brand-sub')!,
  riderList: document.getElementById('rider-list')!,
  stats: document.getElementById('stats')!,
  dayList: document.getElementById('day-list')!,
  dayTable: document.getElementById('day-table')!,
  btn3d: document.getElementById('btn-3d') as HTMLButtonElement,
  btnPlay: document.getElementById('btn-play') as HTMLButtonElement,
  elevation: document.getElementById('elevation') as HTMLCanvasElement,
  tooltip: document.getElementById('chart-tooltip')!,
  demoNotice: document.getElementById('demo-notice')!,
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json()
}

const riders: Rider[] = []
let focusedId = ''
const profileCache = new Map<string, ProfileRow[]>()

const mapView = new MapView(el.map)
const ribbon = new ElevationRibbon(el.elevation, el.tooltip)
const fly = new Flythrough(mapView.map)

function focused(): Rider {
  return riders.find((r) => r.manifest.id === focusedId) ?? riders[0]
}

function renderRiderList(): void {
  el.riderList.innerHTML = ''
  // A single rider needs no legend/toggle panel — hide the list, keep stats.
  ;(el.riderList.parentElement as HTMLElement).querySelector('.panel-heading')!.textContent =
    riders.length > 1 ? 'Riders' : 'The ride'
  el.riderList.style.display = riders.length > 1 ? '' : 'none'
  for (const rider of riders) {
    const li = document.createElement('li')
    li.className = 'rider-row'
    if (rider.manifest.id === focusedId) li.classList.add('focused')
    if (!rider.visible) li.classList.add('hidden-rider')

    const swatch = document.createElement('span')
    swatch.className = 'rider-swatch'
    swatch.style.background = riderColor(rider.colorIdx)

    const name = document.createElement('button')
    name.className = 'rider-name'
    name.textContent = rider.manifest.name
    name.title = `Show ${rider.manifest.name}'s stats and profile`
    name.addEventListener('click', () => void focusRider(rider.manifest.id))

    const km = document.createElement('span')
    km.className = 'rider-km'
    km.textContent = fmtKm(rider.manifest.totals.distanceKm)

    const eye = document.createElement('button')
    eye.className = 'rider-eye'
    eye.title = rider.visible ? `Hide ${rider.manifest.name}'s route` : `Show ${rider.manifest.name}'s route`
    eye.setAttribute('aria-pressed', String(rider.visible))
    eye.innerHTML = rider.visible
      ? '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M2.3 3.7 3.7 2.3l18 18-1.4 1.4-3.1-3.1A11.6 11.6 0 0 1 12 19c-5 0-9-4.5-10-7a13.3 13.3 0 0 1 4.3-5.1zM12 5c5 0 9 4.5 10 7a13.5 13.5 0 0 1-3.2 4.2l-2.2-2.2A4.5 4.5 0 0 0 10 7.9L8.2 6.1C9.4 5.4 10.7 5 12 5z"/></svg>'
    eye.addEventListener('click', () => {
      rider.visible = !rider.visible
      if (!rider.visible && rider.manifest.id === focusedId) {
        const next = riders.find((r) => r.visible)
        if (next) {
          void focusRider(next.manifest.id)
          return
        }
        rider.visible = true // never hide the last visible rider
      }
      mapView.syncRider(rider, rider.manifest.id === focusedId)
      renderRiderList()
    })

    li.append(swatch, name, km, eye)
    el.riderList.append(li)
  }
}

function renderStats(): void {
  const t = focused().manifest.totals
  const entries: Array<[string, string]> = [
    ['Distance', fmtKm(t.distanceKm)],
    ['Climbed', fmtM(t.ascentM)],
    ['Days', String(t.days)],
    ['Moving', fmtDuration(t.movingTimeS)],
  ]
  el.stats.innerHTML = entries
    .map(
      ([label, value]) =>
        `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`,
    )
    .join('')
}

function renderDayList(): void {
  el.dayList.innerHTML = ''
  const rider = focused()
  for (const day of rider.manifest.days) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.className = 'day-row'
    btn.title = `Fly to day ${day.day}${day.date ? ` (${fmtDate(day.date)})` : ''}`
    btn.innerHTML = `<span class="day-num">${String(day.day).padStart(2, '0')}</span><span class="day-label">${day.label}</span><span class="day-dist">${fmtKm(day.distanceKm)} · ${fmtM(day.ascentM)}↑</span>`
    btn.addEventListener('click', () => mapView.flyToDay(rider, day.day))
    li.append(btn)
    el.dayList.append(li)
  }
}

function renderBrandSub(): void {
  const m = focused().manifest
  const dates = m.days.map((d) => d.date).filter(Boolean) as string[]
  const range = dates.length ? ` · ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : ''
  el.brandSub.textContent = `${fmtKm(m.totals.distanceKm)} · ${fmtM(m.totals.ascentM)} climbed${range}`
}

async function loadProfile(id: string): Promise<ProfileRow[]> {
  let profile = profileCache.get(id)
  if (!profile) {
    profile = await fetchJson<ProfileRow[]>(`${id}.profile.json`)
    profileCache.set(id, profile)
  }
  return profile
}

async function focusRider(id: string, intro = false): Promise<void> {
  fly.stop()
  focusedId = id
  const rider = focused()
  rider.visible = true
  for (const r of riders) mapView.syncRider(r, r.manifest.id === focusedId)
  mapView.setDayMarkers(rider)
  renderRiderList()
  renderStats()
  renderDayList()
  renderBrandSub()
  mapView.flyToBounds(rider.manifest.bounds, { intro })
  rider.profile = await loadProfile(id)
  ribbon.setData(rider.profile, rider.manifest.days)
}

function setPlaying(playing: boolean): void {
  el.btnPlay.classList.toggle('playing', playing)
  el.btnPlay.querySelector('.play-label')!.textContent = playing ? 'Stop' : 'Fly the route'
}

async function init(): Promise<void> {
  const manifest = await fetchJson<Manifest>('manifest.json')
  el.demoNotice.hidden = !manifest.demo

  const geojsons = await Promise.all(
    manifest.riders.map((r) => fetchJson<RouteFeatureCollection>(`${r.id}.geojson`)),
  )
  manifest.riders.forEach((m, i) => {
    riders.push({ manifest: m, geojson: geojsons[i], profile: null, visible: true, colorIdx: i })
  })

  await mapView.whenLoaded()
  await focusRider(riders[0].manifest.id, true)

  ribbon.onHover = (row) => {
    if (fly.active) return
    if (row) mapView.showPuck(row[2], row[3])
    else mapView.hidePuck()
  }
  ribbon.onSeek = (row) => {
    if (fly.active) return
    mapView.map.easeTo({ center: [row[2], row[3]], zoom: Math.max(mapView.map.getZoom(), 11.5), duration: 900 })
  }
  mapView.onDayClick = (day) => mapView.flyToDay(focused(), day)

  el.btn3d.addEventListener('click', () => {
    const on = !mapView.terrainEnabled
    mapView.enableTerrain(on)
    el.btn3d.setAttribute('aria-pressed', String(on))
  })

  fly.onProgress = (row, km) => {
    ribbon.setProgress(km)
    mapView.showPuck(row[2], row[3])
  }
  fly.onEnd = () => {
    setPlaying(false)
    ribbon.setProgress(null)
    mapView.hidePuck()
  }
  el.btnPlay.addEventListener('click', async () => {
    if (fly.active) {
      fly.stop()
      mapView.flyToBounds(focused().manifest.bounds)
      return
    }
    if (REDUCED_MOTION) return // respect reduced motion: no auto camera ride
    const profile = await loadProfile(focusedId)
    setPlaying(true)
    fly.start(profile)
  })
  if (REDUCED_MOTION) {
    el.btnPlay.disabled = true
    el.btnPlay.title = 'Fly-through is off because your system prefers reduced motion'
  }
}

init().catch((err) => {
  console.error(err)
  el.brandSub.textContent = 'Could not load route data — run `npm run data` and reload.'
})
