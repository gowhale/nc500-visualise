// Generates a plausible 10-day NC500 loop as in-memory tracks so the site
// works before any real GPX files are dropped in. Replaced entirely once
// data/riders/ contains real rides.
import type { Point } from './geo'
import { haversineM } from './geo'

type Waypoint = [number, number] // lng, lat

interface SampleDay {
  label: string
  waypoints: Waypoint[]
}

const DAYS: SampleDay[] = [
  {
    label: 'Inverness → Applecross',
    waypoints: [
      [-4.2247, 57.4778], [-4.4640, 57.4850], [-4.5660, 57.5650], [-4.7500, 57.5850],
      [-5.0200, 57.5890], [-5.2070, 57.5800], [-5.3200, 57.5300], [-5.4040, 57.3900],
      [-5.5200, 57.3670], [-5.6120, 57.3900], [-5.6850, 57.4197], [-5.8100, 57.4320],
    ],
  },
  {
    label: 'Applecross → Gairloch',
    waypoints: [
      [-5.8100, 57.4320], [-5.8170, 57.5000], [-5.7300, 57.5400], [-5.6530, 57.5220],
      [-5.5120, 57.5450], [-5.3020, 57.6070], [-5.4500, 57.6900], [-5.6900, 57.7280],
    ],
  },
  {
    label: 'Gairloch → Ullapool',
    waypoints: [
      [-5.6900, 57.7280], [-5.6100, 57.7620], [-5.5880, 57.8390], [-5.4500, 57.8500],
      [-5.3200, 57.7900], [-5.1900, 57.7500], [-5.0300, 57.7400], [-5.1600, 57.8950],
    ],
  },
  {
    label: 'Ullapool → Lochinver',
    waypoints: [
      [-5.1600, 57.8950], [-5.0300, 57.9500], [-4.9700, 58.0500], [-5.0500, 58.1000],
      [-5.1500, 58.1200], [-5.2450, 58.1450],
    ],
  },
  {
    label: 'Lochinver → Durness',
    waypoints: [
      [-5.2450, 58.1450], [-5.1500, 58.2000], [-5.0240, 58.2580], [-5.1570, 58.3530],
      [-5.0230, 58.3700], [-4.9950, 58.4350], [-4.8400, 58.5200], [-4.7450, 58.5680],
    ],
  },
  {
    label: 'Durness → Bettyhill',
    waypoints: [
      [-4.7450, 58.5680], [-4.6800, 58.5100], [-4.6400, 58.4500], [-4.5600, 58.4800],
      [-4.4200, 58.4760], [-4.3200, 58.5100], [-4.2260, 58.5200],
    ],
  },
  {
    label: 'Bettyhill → Thurso',
    waypoints: [
      [-4.2260, 58.5200], [-4.0500, 58.5400], [-3.9170, 58.5560], [-3.7300, 58.5700],
      [-3.5250, 58.5950],
    ],
  },
  {
    label: 'Thurso → Wick via John o’ Groats',
    waypoints: [
      [-3.5250, 58.5950], [-3.3440, 58.6160], [-3.2000, 58.6400], [-3.0700, 58.6440],
      [-3.0500, 58.5600], [-3.0930, 58.4540],
    ],
  },
  {
    label: 'Wick → Dornoch',
    waypoints: [
      [-3.0930, 58.4540], [-3.2940, 58.2970], [-3.4400, 58.2200], [-3.6580, 58.1150],
      [-3.8500, 58.0100], [-3.9800, 57.9720], [-4.0280, 57.8800],
    ],
  },
  {
    label: 'Dornoch → Inverness',
    waypoints: [
      [-4.0280, 57.8800], [-4.0530, 57.8110], [-4.2550, 57.6950], [-4.4270, 57.5960],
      [-4.3400, 57.5400], [-4.2247, 57.4778],
    ],
  },
]

// Smooth pseudo-terrain: rolling coastal hills plus a big bump for the
// Bealach na Bà pass on day 1.
function sampleElevation(lng: number, lat: number): number {
  const rolling =
    60 +
    45 * Math.sin(lng * 23.7) * Math.cos(lat * 31.3) +
    35 * Math.sin(lng * 57.1 + 2) * Math.sin(lat * 49.7) +
    25 * Math.cos(lng * 91.3 + lat * 77.9)
  const dLng = (lng - -5.685) * 60000 * Math.cos((lat * Math.PI) / 180)
  const dLat = (lat - 57.4197) * 111320
  const distToPass = Math.sqrt(dLng * dLng + dLat * dLat)
  const pass = 560 * Math.exp(-((distToPass / 3500) ** 2))
  return Math.max(2, rolling + pass)
}

export interface SampleTrack {
  label: string
  points: Point[]
}

export function sampleTracks(): SampleTrack[] {
  const start = Date.UTC(2025, 5, 7, 8, 30, 0)
  return DAYS.map((day, dayIdx) => {
    const points: Point[] = []
    let t = start + dayIdx * 24 * 3600 * 1000
    for (let w = 0; w < day.waypoints.length - 1; w++) {
      const [lng0, lat0] = day.waypoints[w]
      const [lng1, lat1] = day.waypoints[w + 1]
      const legM = haversineM(
        { lng: lng0, lat: lat0, ele: null, time: null },
        { lng: lng1, lat: lat1, ele: null, time: null },
      )
      const steps = Math.max(2, Math.round(legM / 150))
      for (let s = 0; s < steps; s++) {
        const f = s / steps
        // Gentle wiggle so the line reads as a road, not a ruler.
        const wiggle = 0.0012 * Math.sin((w * 7 + f * 19) * Math.PI)
        const lng = lng0 + (lng1 - lng0) * f + wiggle * (lat1 - lat0)
        const lat = lat0 + (lat1 - lat0) * f - wiggle * (lng1 - lng0)
        const ele = sampleElevation(lng, lat)
        // ~18 km/h, slower uphill.
        const speed = Math.max(2.2, 5.2 - ele / 300)
        t += (legM / steps / speed) * 1000
        points.push({ lng, lat, ele, time: t })
      }
    }
    const [lngEnd, latEnd] = day.waypoints[day.waypoints.length - 1]
    points.push({ lng: lngEnd, lat: latEnd, ele: sampleElevation(lngEnd, latEnd), time: t + 60000 })
    return { label: day.label, points }
  })
}
