export interface DayStats {
  day: number
  label: string
  date: string | null
  distanceKm: number
  ascentM: number
  movingTimeS: number | null
  startKm: number
}

export interface RiderManifest {
  id: string
  name: string
  totals: {
    days: number
    distanceKm: number
    ascentM: number
    movingTimeS: number | null
  }
  days: DayStats[]
  bounds: [number, number, number, number]
}

export interface Manifest {
  demo: boolean
  riders: RiderManifest[]
}

/** Profile row: [cumulative km, elevation m, lng, lat, day] */
export type ProfileRow = [number, number, number, number, number]

export interface RouteFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: { day: number; label: string; distanceKm: number; ascentM: number; startKm: number }
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  }>
}

export interface Rider {
  manifest: RiderManifest
  geojson: RouteFeatureCollection
  profile: ProfileRow[] | null
  visible: boolean
  colorIdx: number
}
