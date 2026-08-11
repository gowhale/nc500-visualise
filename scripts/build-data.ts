// Converts data/riders/<id>/*.gpx into optimised GeoJSON + stats under
// public/data/. Runs before dev and build (`npm run data`). With no GPX
// files present it emits a generated NC500 demo rider instead.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import {
  haversineM,
  movingTimeS,
  simplifyIndices,
  smoothElevation,
  totalAscentM,
  type Point,
} from './geo'
import { sampleTracks } from './sample-route'
import { nearestPlace } from './places'

const RIDERS_DIR = join(process.cwd(), 'data', 'riders')
const OUT_DIR = join(process.cwd(), 'public', 'data')
const SIMPLIFY_TOLERANCE_M = 4
const PROFILE_TARGET_POINTS = 2200

interface Track {
  label: string
  points: Point[]
}

interface RiderInput {
  id: string
  name: string
  tracks: Track[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['trk', 'trkseg', 'trkpt'].includes(name),
})

function parseGpx(xml: string, fallbackLabel: string): Track {
  const doc = parser.parse(xml)
  const trks = doc?.gpx?.trk ?? []
  const points: Point[] = []
  let label = fallbackLabel
  for (const trk of trks) {
    if (typeof trk.name === 'string' && trk.name.trim()) label = trk.name.trim()
    for (const seg of trk.trkseg ?? []) {
      for (const pt of seg.trkpt ?? []) {
        const lat = parseFloat(pt['@_lat'])
        const lng = parseFloat(pt['@_lon'])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        const ele = pt.ele !== undefined ? parseFloat(pt.ele) : null
        const time = pt.time ? Date.parse(pt.time) : null
        points.push({
          lng,
          lat,
          ele: Number.isFinite(ele as number) ? (ele as number) : null,
          time: Number.isFinite(time as number) ? (time as number) : null,
        })
      }
    }
  }
  return { label, points }
}

// Personal data that would sit in the raw GPX if committed to a public repo.
// The published site never includes any of this — build output carries only
// coordinates, elevation, day labels, dates, and aggregate stats.
let personalDataFound = false
function reportPersonalData(file: string, xml: string): void {
  const findings: string[] = []
  const sensors: string[] = []
  if (/<(?:\w+:)?hr>/i.test(xml)) sensors.push('heart rate')
  if (/<(?:\w+:)?cad(?:ence)?>/i.test(xml)) sensors.push('cadence')
  if (/<(?:\w+:)?(?:atemp|temp)>/i.test(xml)) sensors.push('temperature')
  if (/<(?:\w+:)?power>/i.test(xml) || /PowerInWatts/i.test(xml)) sensors.push('power')
  if (sensors.length) findings.push(`sensor data (${sensors.join(', ')})`)
  const creator = xml.match(/creator="([^"]*)"/)
  if (creator && creator[1] !== 'nc500-visualise') findings.push(`device/creator "${creator[1]}"`)
  if (/<author>/.test(xml)) findings.push('author metadata')
  if (/<email\b/.test(xml)) findings.push('email address')
  if (findings.length) {
    personalDataFound = true
    console.warn(`  ⚠ ${file} contains ${findings.join('; ')}`)
  }
}

function prettifyName(id: string): string {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

function loadRiders(): { riders: RiderInput[]; demo: boolean } {
  const riders: RiderInput[] = []
  if (existsSync(RIDERS_DIR)) {
    for (const entry of readdirSync(RIDERS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(RIDERS_DIR, entry.name)
      const gpxFiles = readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.gpx'))
        .sort()
      if (!gpxFiles.length) continue
      let name = prettifyName(entry.name)
      const configPath = join(dir, 'rider.json')
      if (existsSync(configPath)) {
        try {
          const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
          if (typeof cfg.name === 'string') name = cfg.name
        } catch {
          console.warn(`  ! ignoring invalid ${configPath}`)
        }
      }
      const tracks = gpxFiles.map((f) => {
        const xml = readFileSync(join(dir, f), 'utf8')
        reportPersonalData(`${entry.name}/${f}`, xml)
        return parseGpx(xml, f.replace(/\.gpx$/i, ''))
      })
      const nonEmpty = tracks.filter((t) => t.points.length >= 2)
      if (nonEmpty.length) riders.push({ id: entry.name, name, tracks: nonEmpty })
    }
  }
  if (riders.length) return { riders, demo: false }
  console.log('No GPX files found in data/riders/ — generating NC500 demo rider.')
  return { riders: [{ id: 'demo', name: 'Demo Rider', tracks: sampleTracks() }], demo: true }
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

// Garmin often names every activity the same ("Highlands Cycling"). When
// labels aren't distinct, rebuild them from the nearest gazetteer places:
// "Inverness → Lochcarron", falling back to "Day N".
function relabelDuplicateDays(rider: RiderInput): void {
  const labels = rider.tracks.map((t) => t.label)
  if (new Set(labels).size === labels.length) return
  rider.tracks.forEach((track, i) => {
    const start = nearestPlace(track.points[0])
    const end = nearestPlace(track.points[track.points.length - 1])
    if (start && end) track.label = start === end ? `${start} loop` : `${start} → ${end}`
    else track.label = `Day ${i + 1}`
  })
}

function buildRider(rider: RiderInput) {
  relabelDuplicateDays(rider)
  const features: object[] = []
  const days: object[] = []
  // Profile rows: [cumulative km, elevation m, lng, lat, day]
  const profile: number[][] = []
  let cumKm = 0
  let totalAscent = 0
  let totalMoving = 0
  let hasMoving = false
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

  rider.tracks.forEach((track, i) => {
    const day = i + 1
    const pts = track.points
    const smoothed = smoothElevation(pts)
    const ascent = Math.round(totalAscentM(pts))
    const moving = movingTimeS(pts)

    let dayDistM = 0
    const cumM: number[] = [0]
    for (let j = 1; j < pts.length; j++) {
      dayDistM += haversineM(pts[j - 1], pts[j])
      cumM.push(dayDistM)
    }

    const keep = simplifyIndices(pts, SIMPLIFY_TOLERANCE_M)
    const coords = keep.map((j) => [round5(pts[j].lng), round5(pts[j].lat)])
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }

    const startKm = cumKm
    const distanceKm = dayDistM / 1000
    const firstTime = pts.find((p) => p.time !== null)?.time ?? null
    const date = firstTime ? new Date(firstTime).toISOString().slice(0, 10) : null

    features.push({
      type: 'Feature',
      properties: { day, label: track.label, distanceKm: +distanceKm.toFixed(1), ascentM: ascent, startKm: +startKm.toFixed(1) },
      geometry: { type: 'LineString', coordinates: coords },
    })
    days.push({
      day,
      label: track.label,
      date,
      distanceKm: +distanceKm.toFixed(1),
      ascentM: ascent,
      movingTimeS: moving,
      startKm: +startKm.toFixed(1),
    })

    // Downsample profile to a fixed spacing so long trips stay light.
    const spacingM = Math.max(60, (dayDistM * rider.tracks.length) / PROFILE_TARGET_POINTS)
    let nextAt = 0
    for (let j = 0; j < pts.length; j++) {
      if (cumM[j] >= nextAt || j === pts.length - 1) {
        profile.push([
          +((startKm + cumM[j] / 1000)).toFixed(3),
          Math.round(smoothed[j]),
          round5(pts[j].lng),
          round5(pts[j].lat),
          day,
        ])
        nextAt = cumM[j] + spacingM
      }
    }

    cumKm += distanceKm
    totalAscent += ascent
    if (moving !== null) {
      totalMoving += moving
      hasMoving = true
    }
  })

  return {
    manifest: {
      id: rider.id,
      name: rider.name,
      totals: {
        days: rider.tracks.length,
        distanceKm: +cumKm.toFixed(1),
        ascentM: Math.round(totalAscent),
        movingTimeS: hasMoving ? totalMoving : null,
      },
      days,
      bounds: [minLng, minLat, maxLng, maxLat],
    },
    geojson: { type: 'FeatureCollection', features },
    profile,
  }
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const { riders, demo } = loadRiders()
const manifests = []
for (const rider of riders) {
  const built = buildRider(rider)
  manifests.push(built.manifest)
  writeFileSync(join(OUT_DIR, `${rider.id}.geojson`), JSON.stringify(built.geojson))
  writeFileSync(join(OUT_DIR, `${rider.id}.profile.json`), JSON.stringify(built.profile))
  const t = built.manifest.totals
  console.log(
    `✓ ${rider.name}: ${t.days} days, ${t.distanceKm} km, ${t.ascentM} m ascent`,
  )
}
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify({ demo, riders: manifests }))
console.log(`Wrote ${riders.length} rider(s) to public/data/`)
if (personalDataFound) {
  console.warn(
    '\n⚠ Personal data found in raw GPX files (see above). The site itself never' +
      '\n  publishes it, but the raw files will be visible if this repo is public.' +
      '\n  Run `npm run scrub` to strip it from the GPX files before committing.',
  )
}
