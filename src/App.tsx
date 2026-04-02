import { useEffect, useMemo, useRef, useState } from 'react'
import { interpCoords, toHorizontalCoords } from './util'
import { Airport, loadAirports } from './airports'
import { calcSun } from './sun'
import { DateTime } from 'luxon'
import { SunPlot } from './SunPlot'
import { Map } from './map'
import './App.css'

/**
 * TODO:
 * - Add plane icon to show trip progress
 * - Add start and end timestamps to compute sun position too
 * - Draw sun with a polygon
 */

const ZERO = [0, 0]

function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const map = useRef<Map | undefined>()
  const [rot, setRot] = useState(0.7)
  const [srcText, setSrcText] = useState('')
  const [dstText, setDstText] = useState('')
  // const [progress, setProgress] = useState(1)
  const [blend, setBlend] = useState(true)
  const [ports, setPorts] = useState<Airport[]>([])

  const src = ports.find((p) => p.code.toLowerCase() === srcText.toLowerCase())?.coords ?? ZERO
  const dst = ports.find((p) => p.code.toLowerCase() === dstText.toLowerCase())?.coords ?? ZERO

  // const start = DateTime.local(2024, 9, 7, 16, 5, { zone: 'Pacific/Auckland' })
  // const end = DateTime.local(2024, 9, 7, 14, 5, { zone: 'America/Vancouver' })
  // const start = DateTime.now()
  // const end = start.plus({ hours: 24 })
  const start = DateTime.local(2024, 3, 15, 16, 12, { zone: 'Australia/Perth' })
  const end = DateTime.local(2024, 3, 15, 22, 37, { zone: 'Australia/Melbourne' })

  useEffect(() => {
    const int = setInterval(() => setRot(Math.random()), 100)
    return () => clearInterval(int)
  }, [setRot])

  const progress = DateTime.now().diff(start).toMillis() / end.diff(start).toMillis()
  const t = start.plus(end.diff(start).mapUnits((t) => progress * t))
  const location = interpCoords(src, dst, progress)
  const sun = calcSun(t)

  const rotate = location[0] / (2 * Math.PI)

  useEffect(() => {
    if (!canvas.current) return
    map.current ||= new Map(canvas.current)
    map.current.render(rotate, sun, src, location, blend)
  }, [rotate, sun, src, location, blend])

  useEffect(() => {
    loadAirports().then(setPorts)
  }, [])

  // useEffect(() => {
  //   const timer = setInterval(() => setSun(calcSun(DateTime.now())), 10000);
  //   return () => clearInterval(timer);
  // }, []);

  const handleMouseMove = (ev: React.MouseEvent) => {
    const rect = canvas.current?.getBoundingClientRect()
    if (!rect) return
    const lon = 2.0 * Math.PI * ((ev.pageX - (rect.left + rect.width / 2)) / (2 * rect.height) + rotate)
    const lat = -Math.PI * ((ev.pageY - (rect.top + rect.height / 2)) / rect.height)
    // setSun([lon, Math.min(Math.max(lat, -0.40910518), 0.40910518)]);
    // setDst([lon, lat])
  }

  const handleClick = (ev: React.MouseEvent) => {
    const rect = canvas.current?.getBoundingClientRect()
    if (!rect) return
    const lon = 2.0 * Math.PI * ((ev.pageX - (rect.left + rect.width / 2)) / (2 * rect.height) + rotate)
    const lat = -Math.PI * ((ev.pageY - (rect.top + rect.height / 2)) / rect.height)
    // setSun([lon, Math.min(Math.max(lat, -0.40910518), 0.40910518)]);
    setDst([lon, lat])
  }

  const h = toHorizontalCoords(location, sun)

  const flight = useMemo(() => ({ start, end, duration: end.diff(start), src, dst }), [start, end, src, dst])

  return (
    <div id="container">
      <div id="canvas-container">
        <canvas id="canvas" ref={canvas} onMouseMove={handleMouseMove} onClick={handleClick} />
      </div>
      <div id="sidebar">
        <div style={{ textAlign: 'center' }}>
          <input value={srcText} onInput={(ev) => setSrcText((ev.target as HTMLInputElement).value)} />
          <input value={dstText} onInput={(ev) => setDstText((ev.target as HTMLInputElement).value)} />
          {/* <pre style={{ width: '20rem', margin: '2rem' }}>{formatCoords(normaliseCoords(sun), '\n')}</pre>
          <pre>Azimuth: {(h.azimuth * (180 / Math.PI)).toFixed(2)}°</pre>
          <pre>Zenith: {(h.zenith * (180 / Math.PI)).toFixed(2)}°</pre>
          <pre style={{ width: '20rem', margin: '2rem' }}>{formatCoords(normaliseCoords(src), '\n')}</pre>
          <pre style={{ width: '20rem', margin: '2rem' }}>{formatCoords(normaliseCoords(dst), '\n')}</pre>
          <input
            type="range"
            min="0"
            max="100"
            // value={(100 * rot).toFixed(0)}
            style={{ width: '90%' }}
            onChange={(ev) => setRot(parseInt(ev.target.value) / 100)}
          />
          <br />
          <label>
            <input type="checkbox" checked={!blend} onChange={(ev) => setBlend(!ev.target.checked)} /> Twilight bands
          </label>
          <br />
          <input
            type="range"
            min="0"
            max="100"
            defaultValue="100"
            style={{ width: '90%' }}
            onChange={(ev) => setProgress(parseInt(ev.target.value) / 100)}
          /> */}
        </div>
        <div>
          <SunPlot flight={flight} progress={progress} blend={blend} />
        </div>
      </div>
    </div>
  )
}

export default App
