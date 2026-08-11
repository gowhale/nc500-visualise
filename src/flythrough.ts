import type maplibregl from 'maplibre-gl'
import type { ProfileRow } from './types'

const FLY_ZOOM = 12.4
const FLY_PITCH = 60
const LOOKAHEAD_KM = 1.6
const BLEND_MS = 2600 // ease from the current camera into the chase camera

function bearingBetween(a: ProfileRow, b: ProfileRow): number {
  const la1 = (a[3] * Math.PI) / 180
  const la2 = (b[3] * Math.PI) / 180
  const dLng = ((b[2] - a[2]) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

export class Flythrough {
  private map: maplibregl.Map
  private raf = 0
  private cancelInput: (() => void) | null = null
  active = false

  onProgress: ((row: ProfileRow, km: number) => void) | null = null
  onEnd: (() => void) | null = null

  constructor(map: maplibregl.Map) {
    this.map = map
  }

  private rowAt(profile: ProfileRow[], km: number): ProfileRow {
    let lo = 0
    let hi = profile.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (profile[mid][0] < km) lo = mid
      else hi = mid
    }
    const a = profile[lo]
    const b = profile[hi]
    const span = b[0] - a[0]
    const f = span > 0 ? (km - a[0]) / span : 0
    return [km, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, a[4]]
  }

  start(profile: ProfileRow[]): void {
    if (this.active || profile.length < 2) return
    this.active = true
    const totalKm = profile[profile.length - 1][0]
    const durationMs = Math.min(120, Math.max(45, totalKm * 0.13)) * 1000

    const startZoom = this.map.getZoom()
    const startPitch = this.map.getPitch()
    let bearing = this.map.getBearing()
    let startTime = 0

    // Any manual interaction hands the camera back to the user.
    const cancel = () => this.stop()
    const canvas = this.map.getCanvasContainer()
    canvas.addEventListener('pointerdown', cancel)
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('keydown', cancel)
    this.cancelInput = () => {
      canvas.removeEventListener('pointerdown', cancel)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('keydown', cancel)
    }

    const frame = (now: number) => {
      if (!this.active) return
      if (!startTime) startTime = now
      const t = Math.min(1, (now - startTime) / durationMs)
      // Ease the ends so the ride starts and finishes gently.
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const km = totalKm * eased

      const pos = this.rowAt(profile, km)
      const ahead = this.rowAt(profile, Math.min(totalKm, km + LOOKAHEAD_KM))
      const targetBearing = km + LOOKAHEAD_KM >= totalKm ? bearing : bearingBetween(pos, ahead)
      bearing += shortestAngle(bearing, targetBearing) * 0.06

      const blend = Math.min(1, (now - startTime) / BLEND_MS)
      this.map.jumpTo({
        center: [pos[2], pos[3]],
        zoom: startZoom + (FLY_ZOOM - startZoom) * blend,
        pitch: startPitch + (FLY_PITCH - startPitch) * blend,
        bearing,
      })
      this.onProgress?.(pos, km)

      if (t >= 1) {
        this.stop()
        return
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    cancelAnimationFrame(this.raf)
    this.cancelInput?.()
    this.cancelInput = null
    this.onEnd?.()
  }
}
