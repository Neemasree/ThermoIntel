import React, { useState, useRef, useEffect, useContext } from 'react'
import { AppContext } from '../App'
import type { ApiThermalEvent } from '../types/api'
import { formatAcqTime, confidenceLabel } from '../utils/eventUtils'
import { api } from '../services/api'

interface Line {
  id: number
  type: 'input' | 'output' | 'error' | 'system' | 'success'
  text: string
}

let _id = 0
const nid = () => ++_id

const BANNER = `ThermalWatch Analyst Terminal  v4.0
NASA FIRMS / ESA WorldCover / OSM Overpass
--------------------------------------------------
Type 'help' for available commands.`

const HELP = `Available commands:

  help                  Show this help
  list                  List loaded thermal events
  inspect <EVENT_ID>    Display full event record
  stats                 Show detection statistics
  satellites            List active satellite platforms
  sources               List FIRMS data sources
  pipeline              Show pipeline status
  clear                 Clear terminal

Prompt: tw >`

function processCommand(
  input: string,
  events: ApiThermalEvent[],
  setSelectedEvent: (e: ApiThermalEvent | null) => void,
  pipelineStatus: unknown,
  statistics: unknown,
): Line[] {
  const parts = input.trim().split(/\s+/)
  const cmd = parts[0]?.toLowerCase() ?? ''
  const arg = parts[1]

  const out  = (text: string): Line => ({ id: nid(), type: 'output',  text })
  const ok   = (text: string): Line => ({ id: nid(), type: 'success', text })
  const err  = (text: string): Line => ({ id: nid(), type: 'error',   text })
  const sys  = (text: string): Line => ({ id: nid(), type: 'system',  text })

  switch (cmd) {
    case 'help':
      return [out(HELP)]

    case 'clear':
      return [{ id: nid(), type: 'system', text: '__CLEAR__' }]

    case 'satellites': {
      const sats = [...new Set(events.map(e => e.satellite).filter(Boolean))]
      if (sats.length === 0) return [err('No satellite data loaded.')]
      const rows = sats.map(s => `  ${s}`).join('\n')
      return [ok(`Active Satellite Platforms\n--------------------------------------------------\n${rows}`)]
    }

    case 'sources': {
      const srcs = [...new Set(events.map(e => e.firms_source).filter(Boolean))]
      if (srcs.length === 0) return [err('No source data loaded.')]
      const rows = srcs.map(s => `  ${s}`).join('\n')
      return [ok(`FIRMS Data Sources\n--------------------------------------------------\n${rows}`)]
    }

    case 'stats': {
      const st = statistics as { total_detections?: number; detections_today?: number; detections_last_7d?: number; avg_frp?: number; max_frp?: number; avg_brightness?: number; last_sync_at?: string } | null
      if (!st) return [err('Statistics unavailable. Backend may be offline.')]
      const lines = [
        'Detection Statistics',
        '--------------------------------------------------',
        `  Total detections   : ${st.total_detections?.toLocaleString() ?? '--'}`,
        `  Today              : ${st.detections_today?.toLocaleString() ?? '--'}`,
        `  Last 7 days        : ${st.detections_last_7d?.toLocaleString() ?? '--'}`,
        `  Average FRP        : ${st.avg_frp != null ? `${st.avg_frp.toFixed(1)} MW` : '--'}`,
        `  Peak FRP           : ${st.max_frp != null ? `${st.max_frp.toLocaleString()} MW` : '--'}`,
        `  Avg brightness     : ${st.avg_brightness != null ? `${st.avg_brightness.toFixed(1)} K` : '--'}`,
        `  Last sync          : ${st.last_sync_at ? new Date(st.last_sync_at).toLocaleString() : '--'}`,
      ].join('\n')
      return [ok(lines)]
    }

    case 'pipeline': {
      const ps = pipelineStatus as {
        status?: string
        firms?: { total_records?: number; latest_acquisition_date?: string; new_records_24h?: number }
        worldcover?: { enriched?: number; pending?: number; version?: string }
        osm?: { enriched?: number; pending?: number; errors?: number }
        scheduler?: { running?: boolean }
      } | null
      if (!ps) return [err('Pipeline status unavailable. Backend may be offline.')]
      const lines = [
        `Pipeline Status: ${(ps.status ?? '--').toUpperCase()}`,
        '--------------------------------------------------',
        '',
        'FIRMS',
        `  Total records      : ${ps.firms?.total_records?.toLocaleString() ?? '--'}`,
        `  Latest acq. date   : ${ps.firms?.latest_acquisition_date ?? '--'}`,
        `  New records (24h)  : ${ps.firms?.new_records_24h?.toLocaleString() ?? '--'}`,
        '',
        'WorldCover',
        `  Enriched           : ${ps.worldcover?.enriched?.toLocaleString() ?? '--'}`,
        `  Pending            : ${ps.worldcover?.pending?.toLocaleString() ?? '--'}`,
        `  Version            : ${ps.worldcover?.version ?? '--'}`,
        '',
        'OSM',
        `  Enriched           : ${ps.osm?.enriched?.toLocaleString() ?? '--'}`,
        `  Pending            : ${ps.osm?.pending?.toLocaleString() ?? '--'}`,
        `  Errors             : ${ps.osm?.errors?.toLocaleString() ?? '--'}`,
        '',
        'Scheduler',
        `  Running            : ${ps.scheduler?.running ? 'YES' : 'NO'}`,
      ].join('\n')
      return [ok(lines)]
    }

    case 'list': {
      if (events.length === 0) return [err('No events loaded. Backend may be offline or database empty.')]
      const rows = events.slice(0, 50).map(e => {
        const id  = (e.event_id ?? `#${e.id}`).padEnd(16)
        const sat = (e.satellite ?? '--').padEnd(14)
        const frp = e.frp != null ? `${e.frp.toLocaleString().padStart(8)} MW` : '          --'
        const dt  = e.acquisition_date ?? '--'
        return `  ${id} ${sat} FRP: ${frp}  ${dt}`
      }).join('\n')
      const note = events.length > 50 ? `\n  ... and ${(events.length - 50).toLocaleString()} more` : ''
      return [ok(`Loaded Events (${events.length.toLocaleString()})\n--------------------------------------------------\n${rows}${note}`)]
    }

    case 'inspect': {
      if (!arg) return [err('Usage: inspect <EVENT_ID>')]
      const ev = events.find(e => e.event_id === arg || String(e.id) === arg)
      if (!ev) return [err(`Event not found: ${arg}`)]
      setSelectedEvent(ev)
      const lines = [
        `Event Record: ${ev.event_id ?? `ID ${ev.id}`}`,
        '--------------------------------------------------',
        `  Latitude           : ${ev.latitude}`,
        `  Longitude          : ${ev.longitude}`,
        `  Date               : ${ev.acquisition_date ?? '--'}`,
        `  Time               : ${formatAcqTime(ev.acquisition_time)}`,
        `  Satellite          : ${ev.satellite ?? '--'}`,
        `  Instrument         : ${ev.instrument ?? '--'}`,
        `  FIRMS Source       : ${ev.firms_source ?? '--'}`,
        `  FRP                : ${ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '--'}`,
        `  Brightness         : ${ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '--'}`,
        `  Confidence         : ${confidenceLabel(ev.confidence)}`,
        `  Day/Night          : ${ev.daynight ?? '--'}`,
        '',
        `  Land Cover         : ${ev.worldcover_class_name ?? (ev.worldcover_version ? 'NoData' : 'Pending')}`,
        `  WC Version         : ${ev.worldcover_version ?? '--'}`,
        `  OSM Status         : ${ev.osm_enrichment_status ?? '--'}`,
        `  Nearest Road       : ${ev.distance_to_road != null ? `${ev.distance_to_road.toFixed(2)} km` : 'Pending'}`,
        `  Nearest Industrial : ${ev.distance_to_industrial != null ? `${ev.distance_to_industrial.toFixed(2)} km` : 'Pending'}`,
        '',
        `  Synced at          : ${ev.firms_synced_at ? new Date(ev.firms_synced_at).toLocaleString() : '--'}`,
        `  Created at         : ${ev.created_at ? new Date(ev.created_at).toLocaleString() : '--'}`,
      ].join('\n')
      return [ok(lines)]
    }

    case '':
      return []

    default:
      return [err(`Unknown command: ${cmd}. Type 'help' for available commands.`)]
  }
}

const INIT: Line[] = [
  { id: nid(), type: 'system', text: BANNER },
  { id: nid(), type: 'system', text: `Session started: ${new Date().toUTCString()}` },
]

export default function TerminalPage() {
  const { events, pipelineStatus, statistics, setSelectedEvent } = useContext(AppContext)
  const [lines, setLines]     = useState<Line[]>(INIT)
  const [input, setInput]     = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  async function submit() {
    const trimmed = input.trim()
    if (!trimmed) return
    const inputLine: Line = { id: nid(), type: 'input', text: trimmed }
    const parts = trimmed.split(/\s+/)
    const cmd = parts[0]?.toLowerCase() ?? ''

    if (cmd === 'inspect' && parts[1]) {
      const arg = parts[1]
      const ev = events.find(e => e.event_id === arg || String(e.id) === arg)
      if (!ev) {
        setLines(prev => [...prev, inputLine, { id: nid(), type: 'error', text: `Event not found: ${arg}` }])
      } else {
        setSelectedEvent(ev)
        const baseLines = processCommand(trimmed, events, setSelectedEvent, pipelineStatus, statistics)
        setLines(prev => [...prev, inputLine, ...baseLines])
        // Fetch prediction async and append
        try {
          const pred = await api.predict(ev.id)
          const predLines: Line[] = []
          if (pred?.prediction) {
            const cls = pred.prediction.class.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            predLines.push({ id: nid(), type: 'success', text: [
              '',
              'AI CLASSIFICATION',
              '--------------------------------------------------',
              `  Class      : ${cls}`,
              `  Confidence : ${(pred.prediction.confidence * 100).toFixed(1)}%`,
              `  Model      : ${pred.prediction.model}`,
            ].join('\n') })
          } else {
            predLines.push({ id: nid(), type: 'output', text: '\nAI CLASSIFICATION : ML pipeline not connected' })
          }
          setLines(prev => [...prev, ...predLines])
        } catch {
          setLines(prev => [...prev, { id: nid(), type: 'output', text: '\nAI CLASSIFICATION : unavailable' }])
        }
      }
    } else {
      const result = processCommand(trimmed, events, setSelectedEvent, pipelineStatus, statistics)
      if (result.some(l => l.text === '__CLEAR__')) {
        setLines([{ id: nid(), type: 'system', text: 'Terminal cleared.' }])
      } else {
        setLines(prev => [...prev, inputLine, ...result])
      }
    }
    setHistory(prev => [trimmed, ...prev.slice(0, 49)])
    setHistIdx(-1)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      submit()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setInput(history[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next)
      setInput(next === -1 ? '' : (history[next] ?? ''))
    }
  }

  function lineColor(type: Line['type']): string {
    if (type === 'input')   return '#6B9EFF'
    if (type === 'error')   return '#F87171'
    if (type === 'success') return '#1DE8E3'
    if (type === 'system')  return '#525252'
    return '#909090'
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#050505', overflow: 'hidden' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div style={{ padding: '7px 16px', background: 'var(--d3)', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }}/>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }}/>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }}/>
        </div>
        <span style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
          thermalwatch -- analyst terminal
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
          {events.length.toLocaleString()} events loaded
        </span>
      </div>

      {/* Output */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.75 }}>
        {lines.map(line => (
          <div key={line.id} style={{ color: lineColor(line.type), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {line.type === 'input' ? (
              <span>
                <span style={{ color: '#525252' }}>tw</span>
                <span style={{ color: '#3E3E3E' }}> &gt; </span>
                <span style={{ color: '#6B9EFF' }}>{line.text}</span>
              </span>
            ) : line.text}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--b1)', background: 'var(--d2)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#525252' }}>tw</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#3E3E3E' }}>&gt;</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-mono)', fontSize: 13, color: '#6B9EFF',
            caretColor: '#1DE8E3',
          }}
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
