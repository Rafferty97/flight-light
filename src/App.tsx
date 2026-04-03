import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { interpCoords } from './util'
import { Airport, loadAirports } from './airports'
import { calcSun } from './sun'
import { DateTime } from 'luxon'
import { SunPlot, Flight } from './SunPlot'
import { GlMap } from './map'
import { find as findTimezone } from 'browser-geo-tz'
import { useLocalStorage } from './hooks'

const ZERO: [number, number] = [0, 0]

type Mode = 'realtime' | 'scrub'
type SidebarView = 'flights' | 'editor'

//  Saved Flight Types

interface FlightRecord {
  id: string
  name: string
  srcText: string
  dstText: string
  departureStr: string
  arrivalStr: string
}

function defaultFlightName(srcCode: string | undefined, dstCode: string | undefined): string {
  if (!srcCode && !dstCode) return 'New flight'
  const src = srcCode ?? '???'
  const dst = dstCode ?? '???'
  return `${src} → ${dst}`
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

//  Helpers

const tzCache = new Map<Airport, string>()

async function getTimezone(airport: Airport): Promise<string> {
  const cached = tzCache.get(airport)
  if (cached) return cached

  const [lon, lat] = airport.coords
  const zones = await findTimezone(lat * (180 / Math.PI), lon * (180 / Math.PI))
  const result = zones[0] ?? 'UTC'
  tzCache.set(airport, result)
  return result
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
  if (exact.length === 1) return []
  const matches = ports.filter(
    (p) =>
      p.code.toLowerCase().startsWith(q) ||
      p.city.toLowerCase().startsWith(q) ||
      p.name.toLowerCase().startsWith(q) ||
      p.city.toLowerCase().includes(q),
  )
  matches.sort((a, b) => {
    const aCode = a.code.toLowerCase().startsWith(q) ? 0 : 1
    const bCode = b.code.toLowerCase().startsWith(q) ? 0 : 1
    return aCode - bCode
  })
  return matches.slice(0, limit)
}

//  AirportInput

interface AirportInputProps {
  label: string
  value: string
  onChange: (val: string) => void
  timezone: string | null
  ports: Airport[]
}

function AirportInput({ label, value, onChange, timezone, ports }: AirportInputProps) {
  // inputText is local draft state — only valid codes are propagated via onChange
  const [inputText, setInputText] = useState(value)
  const [focused, setFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // When the committed value changes externally (e.g. loading a flight), sync the input
  useEffect(() => {
    setInputText(value)
  }, [value])

  const suggestions = useMemo(() => (focused ? matchAirports(ports, inputText) : []), [focused, ports, inputText])
  const resolved = ports.find((p) => p.code.toLowerCase() === value.toLowerCase())

  function commitCode(code: string) {
    const match = ports.find((p) => p.code.toLowerCase() === code.toLowerCase())
    if (match) {
      setInputText(match.code)
      onChange(match.code)
    }
    // If no match, leave inputText as-is but don't propagate
  }

  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(ev.target as Node)) {
        setFocused(false)
        // On blur, if what's typed isn't valid, revert to the last committed value
        const match = ports.find((p) => p.code.toLowerCase() === inputText.toLowerCase())
        if (!match) setInputText(value)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [inputText, value, ports])

  return (
    <div className="flex flex-col gap-1" ref={wrapperRef}>
      <label className="text-xs text-neutral-500 tracking-widest uppercase">{label}</label>
      <div className="relative">
        <input
          value={inputText}
          placeholder="IATA code or city"
          onChange={(ev) => {
            const text = ev.target.value.toUpperCase()
            setInputText(text)
            // Propagate immediately only if it's already a valid code
            const match = ports.find((p) => p.code.toLowerCase() === text.toLowerCase())
            if (match) onChange(match.code)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            const match = ports.find((p) => p.code.toLowerCase() === inputText.toLowerCase())
            if (!match) setInputText(value)
          }}
          className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white text-sm font-mono placeholder-neutral-600 focus:outline-none focus:border-sky-500 transition-colors"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded overflow-hidden shadow-xl">
            {suggestions.map((p) => (
              <li
                key={p.code}
                onMouseDown={() => {
                  commitCode(p.code)
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

//  FlightsList

interface FlightsListProps {
  flights: FlightRecord[]
  activeId: string | null
  onSelect: (id: string, navigate?: boolean) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onReorder: (flights: FlightRecord[]) => void
}

function FlightsList({ flights, activeId, onSelect, onNew, onDelete, onRename, onReorder }: FlightsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)

  function startEdit(flight: FlightRecord) {
    setEditingId(flight.id)
    setEditingName(flight.name)
  }

  function commitEdit(id: string) {
    const trimmed = editingName.trim()
    onRename(id, trimmed)
    setEditingId(null)
  }

  function handleDragStart(index: number) {
    dragIndex.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    dragOverIndex.current = index
  }

  function handleDrop() {
    const from = dragIndex.current
    const to = dragOverIndex.current
    if (from === null || to === null || from === to) return
    const next = [...flights]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    onReorder(next)
    dragIndex.current = null
    dragOverIndex.current = null
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-neutral-500">Saved Flights</h2>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New
        </button>
      </div>

      {flights.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 16.5L12 3 2 16.5M2 16.5L12 13.5l10 3M2 16.5L12 21l10-4.5"
                stroke="#404040"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            No saved flights yet.
            <br />
            Press <span className="text-neutral-500">New</span> to create one.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto flex-1">
          {flights.map((flight, index) => {
            const isActive = flight.id === activeId
            const isEditing = editingId === flight.id
            const displayName =
              flight.name || defaultFlightName(flight.srcText || undefined, flight.dstText || undefined)

            return (
              <li
                key={flight.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
                className={`group flex items-center gap-2 rounded px-2.5 py-2 transition-colors cursor-pointer select-none ${
                  isActive
                    ? 'bg-sky-950 border border-sky-800'
                    : 'bg-neutral-800 border border-neutral-700 hover:border-neutral-600'
                }`}
                onClick={() => !isEditing && onSelect(flight.id)}
                onDoubleClick={() => !isEditing && onSelect(flight.id, true)}
              >
                {/* Drag handle */}
                <span className="text-neutral-600 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                    <circle cx="2" cy="2" r="1.2" />
                    <circle cx="6" cy="2" r="1.2" />
                    <circle cx="2" cy="7" r="1.2" />
                    <circle cx="6" cy="7" r="1.2" />
                    <circle cx="2" cy="12" r="1.2" />
                    <circle cx="6" cy="12" r="1.2" />
                  </svg>
                </span>

                {/* Name / edit input */}
                <div className="flex-1 min-w-0" onClick={(e) => isActive && e.stopPropagation()}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitEdit(flight.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(flight.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-neutral-700 border border-sky-500 rounded px-2 py-0.5 text-white text-sm font-mono focus:outline-none"
                    />
                  ) : (
                    <span className="block truncate text-sm font-mono text-neutral-200">{displayName}</span>
                  )}
                </div>

                {/* Action buttons — visible on hover or when active */}
                <div
                  className={`flex items-center gap-1 shrink-0 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Rename */}
                  <button
                    title="Rename"
                    onClick={() => startEdit(flight)}
                    className="p-1 rounded text-neutral-500 hover:text-sky-400 hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 20h4L18 10l-4-4L4 20zm14-14l-2-2 2.5-2.5 2 2L18 6z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    title="Delete"
                    onClick={() => onDelete(flight.id)}
                    className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

//  App

function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const map = useRef<GlMap | undefined>()

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

  //  Saved flights
  const [savedFlights, setSavedFlights] = useLocalStorage<FlightRecord[]>('savedFlights', [])
  const [activeFlightId, setActiveFlightId] = useLocalStorage<string | null>('activeFlightId', null)
  const [sidebarView, setSidebarView] = useLocalStorage<SidebarView>('sidebarView', 'editor')
  // Track whether the current editor state is "unsaved" relative to the active record
  const [isDirty, setIsDirty] = useLocalStorage('isDirty', false)

  useEffect(() => {
    loadAirports().then(setPorts)
  }, [])

  const src = ports.find((p) => p.code.toLowerCase() === srcText.toLowerCase()) ?? null
  const dst = ports.find((p) => p.code.toLowerCase() === dstText.toLowerCase()) ?? null
  const srcCoords = src?.coords ?? ZERO
  const dstCoords = dst?.coords ?? ZERO

  useEffect(() => {
    if (!src || !departureStr) {
      return
    }
    getTimezone(src).then((tz) => {
      setSrcTimezone(tz)
      const dt = DateTime.fromISO(departureStr, { zone: tz })
      setDeparture(dt.isValid ? dt.toISO() : null)
    })
  }, [src, departureStr, setDeparture, setSrcTimezone])

  useEffect(() => {
    if (!dst || !arrivalStr) {
      return
    }
    getTimezone(dst).then((tz) => {
      setDstTimezone(tz)
      const dt = DateTime.fromISO(arrivalStr, { zone: tz })
      setArrival(dt.isValid ? dt.toISO() : null)
    })
  }, [dst, arrivalStr, setArrival, setDstTimezone])

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
    return { start, end, duration: end.diff(start), src: src.coords, dst: dst.coords }
  }, [departure, arrival, src, dst])

  const progress = useMemo(() => {
    if (!flight) return 0
    if (mode === 'scrub') return scrubProgress
    const now = DateTime.now()
    const p = now.diff(flight.start).toMillis() / flight.duration.toMillis()
    return Math.min(Math.max(p, 0), 1)
  }, [flight, mode, scrubProgress])

  const [realTime, setRealTime] = useState(DateTime.now())
  useEffect(() => {
    const t = setInterval(() => setRealTime(DateTime.now()), 2000)
    return () => clearInterval(t)
  }, [setRealTime])

  const currentTime = useMemo(() => {
    if (!flight || mode === 'realtime') return realTime
    return DateTime.fromMillis(flight.start.toMillis() + progress * flight.duration.toMillis())
  }, [flight, mode, realTime, progress])

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (next === 'scrub' && flight) {
        const now = DateTime.now()
        const p = now.diff(flight.start).toMillis() / flight.duration.toMillis()
        setScrubProgress(Math.min(Math.max(p, 0), 1))
      }
      setMode(next)
    },
    [flight, setMode, setScrubProgress],
  )

  const [location, heading] = useMemo(() => {
    const loc = interpCoords(srcCoords, dstCoords, progress)
    const loc2 = interpCoords(srcCoords, dstCoords, progress + 0.001)
    const heading = Math.atan2(loc2[1] - loc[1], loc2[0] - loc[0])
    return [loc, heading]
  }, [srcCoords, dstCoords, progress])
  const sun = useMemo(() => calcSun(currentTime), [currentTime])
  const rotate = location[0] / (2 * Math.PI)

  useEffect(() => {
    const render = () => {
      if (!canvas.current) return
      map.current ||= new GlMap(canvas.current)
      map.current.setParams(rotate, sun, srcCoords, location, heading, dstCoords)
      map.current.render()
    }
    render()
    if (mode === 'realtime') {
      const interval = setInterval(render, 1000)
      return () => clearInterval(interval)
    }
  }, [rotate, sun, srcCoords, dstCoords, location, heading, blend, mode])

  useEffect(() => {
    const render = () => map.current?.render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [])

  //  Saved-flights actions

  function loadFlightIntoEditor(record: FlightRecord) {
    setSrcText(record.srcText)
    setDstText(record.dstText)
    setDepartureStr(record.departureStr)
    setArrivalStr(record.arrivalStr)
    setIsDirty(false)
  }

  function handleSelectFlight(id: string, navigate = false) {
    const record = savedFlights.find((f) => f.id === id)
    if (!record) return
    setActiveFlightId(id)
    loadFlightIntoEditor(record)
    if (navigate) setSidebarView('editor')
  }

  function handleNewFlight() {
    // Don't persist yet -- open a blank editor in "unsaved" mode
    setActiveFlightId(null)
    setSrcText('')
    setDstText('')
    setDepartureStr('')
    setArrivalStr('')
    setSrcTimezone(null)
    setDstTimezone(null)
    setDeparture(null)
    setArrival(null)
    setIsDirty(false)
    setSidebarView('editor')
  }

  function handleDeleteFlight(id: string) {
    setSavedFlights((prev) => prev.filter((f) => f.id !== id))
    if (activeFlightId === id) {
      setActiveFlightId(null)
    }
  }

  function handleRenameFlight(id: string, name: string) {
    setSavedFlights((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
  }

  function handleReorderFlights(next: FlightRecord[]) {
    setSavedFlights(next)
  }

  // Save current editor state into the active flight record
  function handleSave() {
    if (!activeFlightId) {
      // No active record -- create one with blank name (derived on the fly)
      const id = generateId()
      const record: FlightRecord = {
        id,
        name: '',
        srcText,
        dstText,
        departureStr,
        arrivalStr,
      }
      setSavedFlights((prev) => [...prev, record])
      setActiveFlightId(id)
    } else {
      setSavedFlights((prev) =>
        prev.map((f) => (f.id === activeFlightId ? { ...f, srcText, dstText, departureStr, arrivalStr } : f)),
      )
    }
    setIsDirty(false)
  }

  // Mark dirty when editor fields change
  const markDirty = () => setIsDirty(true)

  const isNegativeDuration = durationMinutes !== null && durationMinutes <= 0

  const activeRecord = savedFlights.find((f) => f.id === activeFlightId)
  // Placeholder uses resolved airport codes so it only updates on valid IATA entries
  const editorNamePlaceholder = defaultFlightName(src?.code, dst?.code)

  return (
    <div className="flex flex-row w-screen h-screen p-3 gap-3 bg-black">
      {/* Globe */}
      <div className="flex-1 rounded-lg overflow-hidden">
        <canvas ref={canvas} className="block w-full h-full bg-black" />
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-3 w-[45ch]">
        {/* Tab bar */}
        <div className="flex rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 shrink-0">
          <button
            onClick={() => setSidebarView('flights')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer ${
              sidebarView === 'flights' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Flights
            {savedFlights.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-neutral-700 text-neutral-400 text-xs leading-none">
                {savedFlights.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSidebarView('editor')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer ${
              sidebarView === 'editor' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Editor
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" title="Unsaved changes" />}
          </button>
        </div>

        {/* Flights list screen */}
        {sidebarView === 'flights' && (
          <div className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 p-4 overflow-hidden flex flex-col">
            <FlightsList
              flights={savedFlights}
              activeId={activeFlightId}
              onSelect={handleSelectFlight}
              onNew={handleNewFlight}
              onDelete={handleDeleteFlight}
              onRename={handleRenameFlight}
              onReorder={handleReorderFlights}
            />
          </div>
        )}

        {/* Editor screen */}
        {sidebarView === 'editor' && (
          <>
            <div className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 p-4 flex flex-col gap-4 overflow-visible">
              {/* Editor header: editable flight name + save button */}
              <div className="flex items-center gap-2">
                <input
                  value={activeRecord?.name ?? ''}
                  onChange={(e) => {
                    if (activeFlightId) {
                      handleRenameFlight(activeFlightId, e.target.value)
                      markDirty()
                    }
                  }}
                  placeholder={editorNamePlaceholder}
                  disabled={!activeFlightId}
                  className="flex-1 min-w-0 bg-transparent text-xs font-semibold tracking-[0.2em] uppercase text-neutral-300 placeholder-neutral-600 focus:outline-none focus:text-white disabled:opacity-40 disabled:cursor-default truncate"
                />
                <button
                  onClick={handleSave}
                  disabled={!isDirty && !!activeFlightId}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    isDirty || !activeFlightId
                      ? 'bg-sky-600 hover:bg-sky-500 text-white'
                      : 'bg-neutral-800 text-neutral-600 cursor-default'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {activeFlightId ? 'Save' : 'Save flight'}
                </button>
              </div>

              <AirportInput
                label="From"
                value={srcText}
                onChange={(v) => {
                  setSrcText(v)
                  markDirty()
                }}
                timezone={srcTimezone}
                ports={ports}
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-500 tracking-widest uppercase">Departure</label>
                <input
                  type="datetime-local"
                  value={departureStr}
                  onChange={(ev) => {
                    setDepartureStr(ev.target.value)
                    markDirty()
                  }}
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

              <AirportInput
                label="To"
                value={dstText}
                onChange={(v) => {
                  setDstText(v)
                  markDirty()
                }}
                timezone={dstTimezone}
                ports={ports}
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-500 tracking-widest uppercase">Arrival</label>
                <input
                  type="datetime-local"
                  value={arrivalStr}
                  onChange={(ev) => {
                    setArrivalStr(ev.target.value)
                    markDirty()
                  }}
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
                        mode === 'realtime'
                          ? 'bg-sky-600 text-white'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
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
                </div>
              )}

              {/* Info */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-500 tracking-widest uppercase">Info</label>
                <span className="flex text-xs font-mono text-neutral-400">
                  Time at origin:
                  <span className="flex-1" />
                  {currentTime?.setZone(srcTimezone ?? undefined).toFormat('HH:mm') ?? ''}
                </span>
                <span className="flex text-xs font-mono text-neutral-400">
                  Time at destination:
                  <span className="flex-1" />
                  {currentTime?.setZone(dstTimezone ?? undefined).toFormat('HH:mm') ?? ''}
                </span>
              </div>
            </div>

            {/* Sun plot */}
            {flight && (
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
                <SunPlot flight={flight} progress={progress} blend={blend} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default App
