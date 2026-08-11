import type { DayStats, ProfileRow } from './types'
import { dayColors } from './colors'

const PAD_LEFT = 46
const PAD_RIGHT = 10
const PAD_TOP = 12
const PAD_BOTTOM = 24

export class ElevationRibbon {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private tooltip: HTMLElement
  private profile: ProfileRow[] = []
  private days: DayStats[] = []
  private colors: string[] = []
  private totalKm = 1
  private maxEle = 100
  private hoverIdx: number | null = null
  private progressKm: number | null = null

  onHover: ((row: ProfileRow | null) => void) | null = null
  onSeek: ((row: ProfileRow) => void) | null = null

  constructor(canvas: HTMLCanvasElement, tooltip: HTMLElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.tooltip = tooltip
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'img')

    new ResizeObserver(() => this.draw()).observe(canvas)
    this.watchDpr()
    canvas.addEventListener('pointermove', (e) => this.handlePointer(e))
    canvas.addEventListener('pointerdown', (e) => {
      const row = this.rowAtEvent(e)
      if (row) this.onSeek?.(row)
    })
    canvas.addEventListener('pointerleave', () => this.clearHover())
    canvas.addEventListener('blur', () => this.clearHover())
    canvas.addEventListener('keydown', (e) => this.handleKey(e))
  }

  /** Re-render when the canvas moves to a monitor with a different pixel ratio. */
  private watchDpr(): void {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        this.draw()
        this.watchDpr()
      },
      { once: true },
    )
  }

  private clearHover(): void {
    this.hoverIdx = null
    this.tooltip.hidden = true
    this.onHover?.(null)
    this.draw()
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.profile.length) return
    const step = Math.max(1, Math.round(this.profile.length / 200))
    const last = this.profile.length - 1
    let idx = this.hoverIdx ?? 0
    switch (e.key) {
      case 'ArrowLeft':
        idx = Math.max(0, idx - step)
        break
      case 'ArrowRight':
        idx = Math.min(last, idx + step)
        break
      case 'Home':
        idx = 0
        break
      case 'End':
        idx = last
        break
      case 'Enter':
      case ' ': {
        const row = this.hoverIdx !== null ? this.profile[this.hoverIdx] : null
        if (row) this.onSeek?.(row)
        e.preventDefault()
        return
      }
      default:
        return
    }
    e.preventDefault()
    this.hoverIdx = idx
    this.showTooltipFor(this.profile[idx])
    this.onHover?.(this.profile[idx])
    this.draw()
  }

  setData(profile: ProfileRow[], days: DayStats[]): void {
    this.profile = profile
    this.days = days
    this.colors = dayColors(days.length)
    this.totalKm = profile.length ? profile[profile.length - 1][0] : 1
    this.maxEle = Math.max(100, ...profile.map((r) => r[1]))
    // Round the scale ceiling to something label-friendly.
    const step = this.maxEle > 600 ? 200 : 100
    this.maxEle = Math.ceil((this.maxEle * 1.08) / step) * step
    this.hoverIdx = null
    this.progressKm = null
    this.canvas.setAttribute(
      'aria-label',
      `Elevation profile: ${days.length} day${days.length === 1 ? '' : 's'}, ${Math.round(this.totalKm)} km, 0 to ${this.maxEle} m. Use arrow keys to inspect.`,
    )
    this.draw()
  }

  setProgress(km: number | null): void {
    this.progressKm = km
    this.draw()
  }

  private xFor(km: number, w: number): number {
    return PAD_LEFT + (km / this.totalKm) * (w - PAD_LEFT - PAD_RIGHT)
  }

  private yFor(ele: number, h: number): number {
    return PAD_TOP + (1 - ele / this.maxEle) * (h - PAD_TOP - PAD_BOTTOM)
  }

  private rowAtEvent(e: PointerEvent): ProfileRow | null {
    if (!this.profile.length) return null
    const rect = this.canvas.getBoundingClientRect()
    const km =
      ((e.clientX - rect.left - PAD_LEFT) / (rect.width - PAD_LEFT - PAD_RIGHT)) * this.totalKm
    const clamped = Math.max(0, Math.min(this.totalKm, km))
    // Rows are sorted by km — binary search for the nearest.
    let lo = 0
    let hi = this.profile.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.profile[mid][0] < clamped) lo = mid
      else hi = mid
    }
    const row =
      clamped - this.profile[lo][0] < this.profile[hi][0] - clamped
        ? this.profile[lo]
        : this.profile[hi]
    this.hoverIdx = this.profile.indexOf(row)
    return row
  }

  private showTooltipFor(row: ProfileRow): void {
    const rect = this.canvas.getBoundingClientRect()
    const x = this.xFor(row[0], rect.width)
    this.tooltip.hidden = false
    this.tooltip.style.left = `${Math.max(70, Math.min(rect.width - 70, x))}px`
    this.tooltip.innerHTML = `<span class="tt-day">Day ${row[4]}</span> · ${row[0].toFixed(1)} km · ${row[1]} m`
  }

  private handlePointer(e: PointerEvent): void {
    const row = this.rowAtEvent(e)
    if (!row) return
    this.showTooltipFor(row)
    this.onHover?.(row)
    this.draw()
  }

  draw(): void {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = window.devicePixelRatio || 1
    if (
      this.canvas.width !== Math.round(rect.width * dpr) ||
      this.canvas.height !== Math.round(rect.height * dpr)
    ) {
      this.canvas.width = Math.round(rect.width * dpr)
      this.canvas.height = Math.round(rect.height * dpr)
    }
    const ctx = this.ctx
    const w = rect.width
    const h = rect.height
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!this.profile.length) return

    // Recessive y grid with round-number labels (maxEle is a multiple of 100).
    ctx.font = '9.5px "IBM Plex Mono", monospace'
    ctx.textBaseline = 'middle'
    const stepM = [100, 200, 250, 500, 1000].find((s) => this.maxEle / s <= 4 && this.maxEle % s === 0) ?? this.maxEle / 4
    const gridSteps = Math.round(this.maxEle / stepM)
    for (let i = 0; i <= gridSteps; i++) {
      const ele = stepM * i
      const y = this.yFor(ele, h)
      ctx.strokeStyle = 'rgba(242, 237, 228, 0.09)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT, y)
      ctx.lineTo(w - PAD_RIGHT, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(148, 141, 127, 0.95)'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(ele)}m`, PAD_LEFT - 7, y)
    }

    // One area + top line per day, with a 2px surface gap between days.
    for (let d = 0; d < this.days.length; d++) {
      const rows = this.profile.filter((r) => r[4] === d + 1)
      if (rows.length < 2) continue
      const color = this.colors[d]
      const inset = d === 0 ? 0 : 1
      const insetEnd = d === this.days.length - 1 ? 0 : 1

      ctx.beginPath()
      rows.forEach((r, i) => {
        const x = this.xFor(r[0], w) + (i === 0 ? inset : 0) - (i === rows.length - 1 ? insetEnd : 0)
        const y = this.yFor(r[1], h)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      const lastX = this.xFor(rows[rows.length - 1][0], w) - insetEnd
      const firstX = this.xFor(rows[0][0], w) + inset
      const baseY = this.yFor(0, h)
      ctx.lineTo(lastX, baseY)
      ctx.lineTo(firstX, baseY)
      ctx.closePath()
      ctx.fillStyle = `${color}4d`
      ctx.fill()

      ctx.beginPath()
      rows.forEach((r, i) => {
        const x = this.xFor(r[0], w)
        const y = this.yFor(r[1], h)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()

      // Day number centred under its segment.
      const midKm = rows[0][0] + (rows[rows.length - 1][0] - rows[0][0]) / 2
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.font = '600 10px "IBM Plex Mono", monospace'
      ctx.fillText(String(d + 1), this.xFor(midKm, w), h - 9)
      ctx.font = '9.5px "IBM Plex Mono", monospace'
    }

    // Fly-through progress: dim what hasn't been ridden yet.
    if (this.progressKm !== null) {
      const px = this.xFor(this.progressKm, w)
      ctx.fillStyle = 'rgba(10, 13, 15, 0.55)'
      ctx.fillRect(px, PAD_TOP, w - PAD_RIGHT - px, h - PAD_TOP - PAD_BOTTOM)
      ctx.strokeStyle = '#f2ede4'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, PAD_TOP)
      ctx.lineTo(px, this.yFor(0, h))
      ctx.stroke()
    }

    // Hover crosshair + dot.
    if (this.hoverIdx !== null && this.profile[this.hoverIdx]) {
      const row = this.profile[this.hoverIdx]
      const x = this.xFor(row[0], w)
      const y = this.yFor(row[1], h)
      ctx.strokeStyle = 'rgba(242, 237, 228, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, PAD_TOP)
      ctx.lineTo(x, this.yFor(0, h))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = this.colors[row[4] - 1] ?? '#fff'
      ctx.fill()
      ctx.strokeStyle = 'rgba(10, 13, 15, 0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
}
