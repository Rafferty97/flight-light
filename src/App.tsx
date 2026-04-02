import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { interpCoords } from './util'
import { Airport, loadAirports } from './airports'
import { calcSun } from './sun'
import { DateTime } from 'luxon'
import { SunPlot, Flight } from './SunPlot'
import { Map } from './map'
import { find as findTimezone } from 'browser-geo-tz'
import { useLocalStorage } from './hooks'

/**
 * TODO:
 * - Add plane icon to show trip progress
 * - Draw sun with a polygon
 */

const ZERO: [number, number] = [0, 0]

type Mode = 'realtime' | 'scrub'

async function getTimezone(airport: Airport): Promise<string> {
  const [lon, lat] = airport.coords
  const zones = await findTimezone(lat * (180 / Math.PI), lon * (180 / Math.PI))
  return zones[0] ?? 'UTC'
}

function formatDuration(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.round(Math.abs(minutes) % 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function matchAirports(ports: Airport[], query: string, limit = 6): Airport[] {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  const exact = ports.filter((p) => p.code.toLowerCase() === q)
  if (exact.length === 1) return [] // already resolved, no need for dropdown
  const matches = ports.filter(
    (p) =>
      p.code.toLowerCase().startsWith(q) ||
      p.city.toLowerCase().startsWith(q) ||
      p.name.toLowerCase().startsWith(q) ||
      p.city.toLowerCase().includes(q),
  )
  // Sort: code-first matches first, then city matches
  matches.sort((a, b) => {
    const aCode = a.code.toLowerCase().startsWith(q) ? 0 : 1
    const bCode = b.code.toLowerCase().startsWith(q) ? 0 : 1
    return aCode - bCode
  })
  return matches.slice(0, limit)
}

interface AirportInputProps {
  label: string
  value: string
  onChange: (val: string) => void
  timezone: string | null
  ports: Airport[]
}

function AirportInput({ label, value, onChange, timezone, ports }: AirportInputProps) {
  const [focused, setFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => (focused ? matchAirports(ports, value) : []), [focused, ports, value])

  const resolved = ports.find((p) => p.code.toLowerCase() === value.toLowerCase())

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(ev.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="flex flex-col gap-1" ref={wrapperRef}>
      <label className="text-xs text-neutral-500 tracking-widest uppercase">{label}</label>
      <div className="relative">
        <input
          value={value}
          placeholder="IATA code or city"
          onChange={(ev) => onChange(ev.target.value.toUpperCase())}
          onFocus={() => setFocused(true)}
          className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white text-sm font-mono placeholder-neutral-600 focus:outline-none focus:border-sky-500 transition-colors"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded overflow-hidden shadow-xl">
            {suggestions.map((p) => (
              <li
                key={p.code}
                onMouseDown={() => {
                  onChange(p.code)
                  setFocused(false)
                }}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-700 transition-colors"
              >
                <span className="text-sky-400 font-mono text-sm w-10 shrink-0">{p.code}</span>
                <span className="text-neutral-300 text-sm truncate">{p.city}</span>
                {p.name && p.name !== 'N/A' && (
                  <span className="text-neutral-600 text-xs truncate ml-auto">{p.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {timezone && <span className="text-xs text-sky-500 font-mono">{timezone}</span>}
      {resolved && !timezone && <span className="text-xs text-neutral-600 font-mono">resolving timezone…</span>}
    </div>
  )
}

function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const map = useRef<Map | undefined>()

  const [ports, setPorts] = useState<Airport[]>([])
  const [srcText, setSrcText] = useLocalStorage('srcText', '')
  const [dstText, setDstText] = useLocalStorage('dstText', '')
  const [departureStr, setDepartureStr] = useLocalStorage('departureStr', '')
  const [arrivalStr, setArrivalStr] = useLocalStorage('arrivalStr', '')
  const [mode, setMode] = useLocalStorage<Mode>('mode', 'realtime')
  const [scrubProgress, setScrubProgress] = useLocalStorage('scrubProgress', 0)
  const [blend] = useLocalStorage('blend', true)
  const [srcTimezone, setSrcTimezone] = useLocalStorage<string | null>('srcTimezone', null)
  const [dstTimezone, setDstTimezone] = useLocalStorage<string | null>('dstTimezone', null)
  const [departure, setDeparture] = useLocalStorage<string | null>('departure', null)
  const [arrival, setArrival] = useLocalStorage<string | null>('arrival', null)

  // Tick every minute in realtime mode to keep time display current
  const [, setTick] = useState(0)
  useEffect(() => {
    if (mode !== 'realtime') return
    const interval = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(interval)
  }, [mode])

  useEffect(() => {
    if (ports.length === 0) loadAirports().then(setPorts)
  }, [])

  const src = ports.find((p) => p.code.toLowerCase() === srcText.toLowerCase())
  const dst = ports.find((p) => p.code.toLowerCase() === dstText.toLowerCase())
  const srcCoords = src?.coords ?? ZERO
  const dstCoords = dst?.coords ?? ZERO

  useEffect(() => {
    if (!src || !departureStr) {
      setSrcTimezone(null)
      setDeparture(null)
      return
    }
    getTimezone(src).then((tz) => {
      setSrcTimezone(tz)
      const dt = DateTime.fromISO(departureStr, { zone: tz })
      setDeparture(dt.isValid ? dt.toISO() : null)
    })
  }, [src?.code, departureStr])

  useEffect(() => {
    if (!dst || !arrivalStr) {
      setDstTimezone(null)
      setArrival(null)
      return
    }
    getTimezone(dst).then((tz) => {
      setDstTimezone(tz)
      const dt = DateTime.fromISO(arrivalStr, { zone: tz })
      setArrival(dt.isValid ? dt.toISO() : null)
    })
  }, [dst?.code, arrivalStr])

  const durationMinutes = useMemo(() => {
    if (!departure || !arrival) return null
    const start = DateTime.fromISO(departure)
    const end = DateTime.fromISO(arrival)
    if (!start.isValid || !end.isValid) return null
    return end.diff(start, 'minutes').minutes
  }, [departure, arrival])

  const flight: Flight | null = useMemo(() => {
    if (!departure || !arrival || !src || !dst) return null
    const start = DateTime.fromISO(departure)
    const end = DateTime.fromISO(arrival)
    if (!start.isValid || !end.isValid || end <= start) return null
    return {
      start,
      end,
      duration: end.diff(start),
      src: src.coords,
      dst: dst.coords,
    }
  }, [departure, arrival, src?.code, dst?.code])

  const progress = useMemo(() => {
    if (!flight) return 0
    if (mode === 'scrub') return scrubProgress
    const now = DateTime.now()
    const p = now.diff(flight.start).toMillis() / flight.duration.toMillis()
    return Math.min(Math.max(p, 0), 1)
  }, [flight, mode, scrubProgress])

  // In realtime mode, currentTime is always DateTime.now() regardless of flight
  const currentTime = useMemo(() => {
    if (mode === 'realtime') return DateTime.now()
    if (!flight) return null
    return DateTime.fromMillis(flight.start.toMillis() + progress * flight.duration.toMillis())
  }, [flight, mode, progress])

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (next === 'scrub' && flight) {
        const now = DateTime.now()
        const p = now.diff(flight.start).toMillis() / flight.duration.toMillis()
        setScrubProgress(Math.min(Math.max(p, 0), 1))
      }
      setMode(next)
    },
    [flight],
  )

  const location = useMemo(() => interpCoords(srcCoords, dstCoords, progress), [srcCoords, dstCoords, progress])
  const sun = useMemo(() => calcSun(currentTime ?? DateTime.now()), [currentTime])
  const rotate = location[0] / (2 * Math.PI)

  useEffect(() => {
    const render = () => {
      if (!canvas.current) return
      map.current ||= new Map(canvas.current)
      map.current.setParams(rotate, sun, srcCoords, location, blend)
      map.current.render()
    }
    render()
    if (mode === 'realtime') {
      const interval = setInterval(render, 1000)
      return () => clearInterval(interval)
    }
  }, [rotate, sun, srcCoords, location, blend, mode])

  useEffect(() => {
    const render = () => map.current?.render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [])

  const isNegativeDuration = durationMinutes !== null && durationMinutes <= 0

  return (
    <div className="flex flex-row w-screen h-screen p-3 gap-3 bg-black">
      {/* Globe */}
      <div className="flex-1 rounded-lg overflow-hidden">
        <canvas ref={canvas} className="block w-full h-full bg-black" />
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-3 w-[45ch]">
        {/* Flight inputs */}
        <div className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 p-4 flex flex-col gap-4 overflow-visible">
          <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-neutral-500">Flight</h2>

          <AirportInput label="From" value={srcText} onChange={setSrcText} timezone={srcTimezone} ports={ports} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 tracking-widest uppercase">Departure</label>
            <input
              type="datetime-local"
              value={departureStr}
              onChange={(ev) => setDepartureStr(ev.target.value)}
              disabled={!src}
              className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-neutral-700" />
            {isNegativeDuration ? (
              <span className="text-xs text-red-400 font-mono px-2">⚠ arrival before departure</span>
            ) : durationMinutes !== null ? (
              <span className="text-xs text-neutral-400 font-mono px-2">{formatDuration(durationMinutes)}</span>
            ) : (
              <span className="text-xs text-neutral-700 font-mono px-2">–</span>
            )}
            <div className="flex-1 h-px bg-neutral-700" />
          </div>

          <AirportInput label="To" value={dstText} onChange={setDstText} timezone={dstTimezone} ports={ports} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 tracking-widest uppercase">Arrival</label>
            <input
              type="datetime-local"
              value={arrivalStr}
              onChange={(ev) => setArrivalStr(ev.target.value)}
              disabled={!dst}
              className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>

          {/* Mode toggle */}
          {flight && (
            <div className="flex flex-col gap-2 pt-1">
              <label className="text-xs text-neutral-500 tracking-widest uppercase">Mode</label>
              <div className="flex rounded overflow-hidden border border-neutral-700">
                <button
                  onClick={() => handleModeChange('realtime')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    mode === 'realtime' ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  Real time
                </button>
                <button
                  onClick={() => handleModeChange('scrub')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    mode === 'scrub' ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  Scrub
                </button>
              </div>
            </div>
          )}

          {/* Scrub slider */}
          {mode === 'scrub' && flight && (
            <div className="flex flex-col gap-2">
              <input
                type="range"
                min="0"
                max="1000"
                value={Math.round(scrubProgress * 1000)}
                onChange={(ev) => setScrubProgress(parseInt(ev.target.value) / 1000)}
                className="w-full accent-sky-500"
              />
              {currentTime && srcTimezone && dstTimezone && (
                <div className="flex justify-between text-xs font-mono text-neutral-400">
                  <span>{currentTime.setZone(srcTimezone).toFormat('HH:mm z')}</span>
                  <span>{currentTime.setZone(dstTimezone).toFormat('HH:mm z')}</span>
                </div>
              )}
            </div>
          )}

          {/* Realtime time display — always shown if we have timezones */}
          {mode === 'realtime' && currentTime && (srcTimezone || dstTimezone) && (
            <div className="flex justify-between text-xs font-mono text-neutral-400">
              {srcTimezone ? <span>{currentTime.setZone(srcTimezone).toFormat('HH:mm z')}</span> : <span />}
              {dstTimezone ? <span>{currentTime.setZone(dstTimezone).toFormat('HH:mm z')}</span> : <span />}
            </div>
          )}
        </div>

        {/* Sun plot */}
        {flight && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
            <SunPlot flight={flight} progress={progress} blend={blend} />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
