export function fmtKm(km: number): string {
  return `${km.toLocaleString('en-GB', { maximumFractionDigits: km >= 100 ? 0 : 1 })} km`
}

export function fmtM(m: number): string {
  return `${Math.round(m).toLocaleString('en-GB')} m`
}

export function fmtDuration(s: number | null): string {
  if (s === null) return '—'
  const totalMin = Math.round(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
