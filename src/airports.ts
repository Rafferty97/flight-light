import { LongLat } from './types'

export interface Airport {
  code: string
  name: string
  city: string
  coords: LongLat
}

export async function loadAirports(): Promise<Airport[]> {
  const raw = await (await fetch(`${import.meta.env.BASE_URL}airports.txt`)).text()
  const out: Airport[] = []
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(':')
    if (typeof parts[1] !== 'string') continue
    if (parts[1] === 'N/A') continue
    const lat = parseFloat(parts[14] ?? '0')
    const lon = parseFloat(parts[15] ?? '0')
    if (lat === 0 && lon === 0) continue
    out.push({
      code: parts[1],
      name: parts[2] ?? '',
      city: parts[3] ?? '',
      coords: [lon * (Math.PI / 180), lat * (Math.PI / 180)],
    })
  }
  return out
}
