import { DateTime } from 'luxon'
import { useMemo } from 'react'
import { interpCoords, toHorizontalCoords } from './util'
import { calcSun } from './sun'
import { LongLat } from './types'

export function SunPlot(props: { start: DateTime; end: DateTime; src: LongLat; dst: LongLat; progress: number }) {
  const points = useMemo(() => {
    const points = []
    const n = 80
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const location = interpCoords(props.src, props.dst, t)
      const time = props.start.plus(props.end.diff(props.start).mapUnits((v) => t * v))
      const sun = calcSun(time)
      const coords = toHorizontalCoords(location, sun)
      const zenith = coords.zenith * (180 / Math.PI)
      const color = skyRgba(zenith)
      points.push({ t, zenith, color })
    }
    return points
  }, [props.start, props.end, props.src, props.dst])

  const d = useMemo(
    () => points.reduce((acc, p, idx) => `${acc} ${idx ? 'L' : 'M'} ${400 * p.t} ${100 - p.zenith}`, ''),
    [points]
  )

  return (
    <svg width="400" height="180" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="clipRect">
          <rect x="0" y="0" width={400 * props.progress} height="200" />
        </clipPath>
        <linearGradient id="gradientBg" x1="0%" y1="0%" x2="100%" y2="0%">
          {points.map(({ t, color }) => (
            <stop offset={`${100 * t}%`} stop-color={color} />
          ))}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="200" fill="black" />
      <image href="/stars.jpg" width="400" height="400" x="0" y="-100" opacity={0.6} />
      <rect x="0" y="0" width="400" height="200" fill="url(#gradientBg)" />
      <path d="M0,100 L400,100" stroke="white" strokeWidth="1" fill="none" />
      {/* <path d="M0,0 L400,0" stroke="white" strokeWidth="1" fill="none" /> */}
      {/* <path d="M0,180 L400,180" stroke="white" strokeWidth="1" fill="none" /> */}
      <path d={d} stroke="white" strokeWidth="2" fill="none" clip-path="url(#clipRect)" />
    </svg>
  )
}

function skyRgba(zenith: number) {
  const a = Math.sin(zenith * (Math.PI / 180))
  const b = 1 / (1 + Math.exp((zenith + 9) / 3))
  const curve = (dusk: number, sunset: number, day: number) => {
    return sunset + b * (2 * dusk - sunset) + a * (day - sunset)
  }
  const rgba = [curve(15, 10, 115), curve(25, 90, 165), curve(55, 160, 210), 1 - b]
  return `rgba(${rgba.join(', ')})`
}
