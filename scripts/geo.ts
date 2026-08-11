export interface Point {
  lng: number
  lat: number
  ele: number | null
  time: number | null // epoch ms
}

const R = 6371000

export function haversineM(a: Point, b: Point): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Equirectangular projection to metres around a reference latitude — good
// enough for perpendicular-distance tests over a single track.
function project(p: Point, cosLat: number): [number, number] {
  return [((p.lng * Math.PI) / 180) * R * cosLat, ((p.lat * Math.PI) / 180) * R]
}

function perpDistM(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = a[0] + t * dx - p[0]
  const py = a[1] + t * dy - p[1]
  return Math.sqrt(px * px + py * py)
}

/** Douglas–Peucker returning the kept indices (always includes endpoints). */
export function simplifyIndices(points: Point[], toleranceM: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i)
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180)
  const proj = points.map((p) => project(p, cosLat))
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let maxIdx = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpDistM(proj[i], proj[start], proj[end])
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxDist > toleranceM && maxIdx > 0) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }
  const out: number[] = []
  for (let i = 0; i < keep.length; i++) if (keep[i]) out.push(i)
  return out
}

/** Centred moving average, ignoring nulls. */
export function smoothElevation(points: Point[], window = 7): number[] {
  const half = Math.floor(window / 2)
  const out: number[] = []
  for (let i = 0; i < points.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      const e = points[j].ele
      if (e !== null) {
        sum += e
        n++
      }
    }
    out.push(n ? sum / n : 0)
  }
  return out
}

/**
 * Total ascent, computed the way Strava/Garmin do: resample elevation by
 * distance (kills stationary drift and recording-rate differences), then sum
 * climbs between turning points confirmed by a hysteresis threshold.
 * Validated against a real 10-day ride: matches Strava's total within ~2%.
 */
export function totalAscentM(points: Point[], stepM = 50, threshold = 3): number {
  if (points.length < 2) return 0
  const ele: number[] = []
  let acc = 0
  let lastEle = points[0].ele ?? 0
  ele.push(lastEle)
  for (let i = 1; i < points.length; i++) {
    acc += haversineM(points[i - 1], points[i])
    if (points[i].ele !== null) lastEle = points[i].ele!
    while (acc >= stepM) {
      ele.push(lastEle)
      acc -= stepM
    }
  }

  let ascent = 0
  let anchor = ele[0] // elevation at the last confirmed valley
  let candidate = ele[0] // running extreme since the last turning point
  let climbing = false
  for (const e of ele) {
    if (climbing) {
      if (e > candidate) candidate = e
      else if (candidate - e >= threshold) {
        ascent += candidate - anchor
        anchor = e
        candidate = e
        climbing = false
      }
    } else {
      if (e < candidate) candidate = e
      else if (e - candidate >= threshold) {
        anchor = candidate
        candidate = e
        climbing = true
      }
    }
  }
  if (climbing && candidate > anchor) ascent += candidate - anchor
  return ascent
}

/** Moving time: skip pauses (long gaps or near-zero speed). */
export function movingTimeS(points: Point[]): number | null {
  let total = 0
  let any = false
  for (let i = 1; i < points.length; i++) {
    const t0 = points[i - 1].time
    const t1 = points[i].time
    if (t0 === null || t1 === null) continue
    any = true
    const dt = (t1 - t0) / 1000
    if (dt <= 0 || dt > 60) continue
    const d = haversineM(points[i - 1], points[i])
    if (d / dt > 0.8) total += dt
  }
  return any ? Math.round(total) : null
}
