import { DateTime, Duration } from 'luxon'
import { useMemo } from 'react'
import { interpCoords, toHorizontalCoords } from './util'
import { calcSun } from './sun'
import { LongLat } from './types'

export interface Flight {
  start: DateTime
  end: DateTime
  duration: Duration
  src: LongLat
  dst: LongLat
}

export interface SunPlotProps {
  flight: Flight
  progress: number
  blend?: boolean
}

export function SunPlot(props: SunPlotProps) {
  const points = useMemo(() => {
    const points = []
    const n = Math.min(Math.ceil(props.flight.duration.as('minutes') / 6), 200)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const zenith = calcZenith(props.flight, t)
      const color = skyRgba(zenith)
      points.push({ t, zenith, color })
    }
    return points
  }, [props.flight])

  const d = useMemo(
    () => points.reduce((acc, p, idx) => `${acc} ${idx ? 'L' : 'M'} ${400 * p.t} ${100 - p.zenith}`, ''),
    [points]
  )

  // FIXME: Newton's method to pin-point transitions
  const rects = useMemo(() => {
    let prev: Phase | undefined
    const out = points.flatMap(({ t, zenith }) => {
      const phase = dayPhase(zenith)
      if (phase === prev) return []
      prev = phase
      return [{ t, w: 1, fill: phaseRgba(phase) }]
    })
    for (let i = 1; i < out.length; i++) {
      out[i - 1].w = out[i].t - out[i - 1].t
    }
    return out
  }, [points])

  return (
    <svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="clipRect">
          <rect x="0" y="0" width={400 * props.progress} height="200" />
        </clipPath>
        <clipPath id="clipRect2">
          <rect x="0" y="0" width="400" height="200" />
        </clipPath>
        <linearGradient id="gradientBg" x1="0%" y1="0%" x2="100%" y2="0%">
          {points.map(({ t, color }) => (
            <stop key={t} offset={`${100 * t}%`} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <g clipPath="url(#clipRect2)">
        {/* BLACK BACKGROUDN */}
        <rect x="0" y="0" width="400" height="200" fill="black" />
        {/* STARS */}
        <image href="/stars.jpg" width="600" height="400" x="-100" y="-100" opacity={0.5} />
        {/* DAYLIGHT */}
        {props.blend === false ? (
          rects.map(({ t, w, fill }) => <rect x={400 * t} y="0" width={400 * w} height="200" fill={fill} />)
        ) : (
          <rect x="0" y="0" width="400" height="200" fill="url(#gradientBg)" />
        )}
        {/* HORIZONTAL GUIDES */}
        {[-90, -18, 0, 90].map((z) => (
          <path key={z} d={`M0,${100 - z} L400,${100 - z}`} stroke="#fff8" strokeWidth="1" fill="none" />
        ))}
        {/* UNFILLED LINE */}
        <path d={d} stroke="#fff8" strokeWidth="1" fill="none" />
        {/* FILLED LIEN */}
        <path d={d} stroke="#ffa" strokeWidth="2" fill="none" clipPath="url(#clipRect)" />
        {/* SUN */}
        <circle cx={400 * props.progress} cy={100 - calcZenith(props.flight, props.progress)} r={6} fill="#ffa" />
      </g>
    </svg>
  )
}

function calcZenith(flight: Flight, t: number): number {
  const location = interpCoords(flight.src, flight.dst, t)
  const time = DateTime.fromMillis(flight.start.toMillis() + t * flight.duration.toMillis())
  const sun = calcSun(time)
  const coords = toHorizontalCoords(location, sun)
  return coords.zenith * (180 / Math.PI)
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

type Phase = 'day' | 'twilight' | 'night'

function dayPhase(zenith: number): Phase {
  return zenith > 0 ? 'day' : zenith < -18 ? 'night' : 'twilight'
}

function phaseRgba(phase: Phase) {
  switch (phase) {
    case 'day':
      return skyRgba(60)
    case 'twilight':
      return skyRgba(-6)
    case 'night':
      return skyRgba(-60)
  }
}

// FIXME: Create method to identify all transitions like sunrise
