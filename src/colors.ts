// Rider identity colours — validated for CVD separation and contrast against
// the dark panel surface (dataviz six-checks). Order is fixed; never cycled.
export const RIDER_COLORS = ['#D67A15', '#1E9ED2', '#2FAC57', '#E25CA8', '#8F8AE8', '#C9B458']

// Brighter twins for lines drawn over satellite imagery (always with a dark
// casing underneath); panel swatches and chart marks use RIDER_COLORS.
export const RIDER_MAP_COLORS = ['#FFA83D', '#3DC3FF', '#4EDD7C', '#FF7ECB', '#B0AAFF', '#EBD35E']

// Sunset ramp for the focused rider's day-by-day progression.
const DAY_RAMP: [number, number, number][] = [
  [255, 201, 77], // amber
  [255, 120, 71], // ember
  [240, 66, 107], // rose
  [193, 63, 214], // violet
]

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

export function dayColor(day: number, totalDays: number): string {
  const t = totalDays <= 1 ? 0 : (day - 1) / (totalDays - 1)
  const seg = Math.min(DAY_RAMP.length - 2, Math.floor(t * (DAY_RAMP.length - 1)))
  const f = t * (DAY_RAMP.length - 1) - seg
  const [r0, g0, b0] = DAY_RAMP[seg]
  const [r1, g1, b1] = DAY_RAMP[seg + 1]
  const r = Math.round(lerp(r0, r1, f))
  const g = Math.round(lerp(g0, g1, f))
  const b = Math.round(lerp(b0, b1, f))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export function dayColors(totalDays: number): string[] {
  return Array.from({ length: totalDays }, (_, i) => dayColor(i + 1, totalDays))
}

export function riderColor(idx: number): string {
  return RIDER_COLORS[idx % RIDER_COLORS.length]
}

export function riderMapColor(idx: number): string {
  return RIDER_MAP_COLORS[idx % RIDER_MAP_COLORS.length]
}
