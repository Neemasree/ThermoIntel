/**
 * TerminalPage — Aerospace operations console.
 * Real command/response only. Monospace throughout.
 * No fabricated output.
 */
import React, { useState, useRef, useEffect, useContext } from 'react'
import { AppContext } from '../App'
import type { ApiThermalEvent } from '../types/api'
import { formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'

interface Line {
  id: number
  type: 'input' | 'output' | 'error' | 'system' | 'success' | 'dim'
  text: string
}

let lid = 0
const mkId = () => ++lid

const BANNER = [
  '╔════════════════════════════════════════════════════════╗',
  '║   THERMALWATCH  ·  Analyst Terminal  ·  v4.0           ║',
  '║   Satellite Thermal Intelligence Platform              ║',
  '║   Backend: FIRMS / VIIRS / MODIS pipeline              ║',
  '╚════════════════════════════════════════════════════════╝',
  '',
  '  Type  help  for available commands.',
  '',
].join('\n')

const HELP = [
  '  AVAILABLE COMMANDS',
  '  ' + '─'.repeat(48),
  '  help                  Show this help',
  '  list                  List loaded events (current batch)',
  '  inspect <EVENT_ID>    Inspect full event record',
  '  stats                 Backend detection statistics',
  '  satellites            Active satellite platforms',
  '  sources               FIRMS data sources',
  '  pipeline              Pipeline & enrichment status',
  '  clear                 Clear terminal',
  '',
  '  All data is live from the backend API.',
  '  This terminal operates on the current loaded batch only.',
].join('\n')

function processCommand(
  raw: string,
  events: ApiThermalEvent[],
  setSelectedEvent: (e: ApiThermalEvent | null) => void,
  pipeline: unknown,
  stats: unknown,
): Line[] {
  const parts = raw.trim().split(/\s+/)
  const cmd = (parts[0] ?? '').toLowerCase()
  const arg = parts.slice(1).join(' ')

  const out  = (t: string, type: Line['type'] = 'output'): Line => ({ id: mkId(), type, text: t })
  const err  = (t: string) => out(t, 'error')
  const ok   = (t: string) => out(t, 'success')
  const dim  = (t: string) => out(t, 'dim')

  switch (cmd) {
    case 'help': return [ok(HELP)]

    case 'clear': return [{ id: mkId(), type: 'system', text: '__CLEAR__' }]

    case 'list': {
      if (events.length === 0) return [err('  No events loaded. Backend may be offline.')]
      const header = `\n  Loaded batch: ${events.length} events\n  ${'─'.repeat(66)}`
      const rows = events.slice(0, 60).map(e => {
        const id  = (e.event_id ?? '—').padEnd(28)
        const sat = (e.satellite ?? '—').padEnd(10)
        const frp = e.frp != null ? `${e.frp.toLocaleString()} MW`.padStart(11) : '          —'
        const dt  = e.acquisition_date ?? '—'
        return `  ${id}  ${sat}  ${frp}  ${dt}`
      }).join('\n')
      const more = events.length > 60 ? `\n  … and ${events.length - 60} more` : ''
      return [ok(`${header}\n${rows}${more}`)]
    }

    case 'inspect': {
      if (!arg) return [err('  Usage: inspect <EVENT_ID>')]
      const ev = events.find(e => e.event_id === arg)
      if (!ev) {
        const close = events.filter(e => e.event_id?.toLowerCase().includes(arg.toLowerCase())).slice(0, 5)
        const hint = close.length > 0
          ? `\n\n  Close matches:\n${close.map(e => `    ${e.event_id}`).join('\n')}`
          : ''
        return [err(`  Event not found: ${arg}${hint}`)]
      }
      setSelectedEvent(ev)
      const t = [
        '',
        `  EVENT RECORD  ·  ${ev.event_id}`,
        `  ${'─'.repeat(52)}`,
        `  Latitude         ${ev.latitude}`,
        `  Longitude        ${ev.longitude}`,
        `  Date             ${ev.acquisition_date ?? '—'}`,
        `  Time             ${formatAcqTime(ev.acquisition_time)}`,
        `  Satellite        ${ev.satellite ?? '—'}`,
        `  Instrument       ${ev.instrument ?? '—'}`,
        `  FIRMS Source     ${ev.firms_source ?? '—'}`,
        `  FRP              ${ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '—'}`,
        `  Brightness       ${ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '—'}`,
        `  Confidence       ${confidenceLabel(ev.confidence)}`,
        `  FRP Tier         ${frpTier(ev.frp)}`,
        `  Day / Night      ${ev.daynight ?? '—'}`,
        `  Land Cover       ${ev.worldcover_class_name ?? (ev.worldcover_version ? 'NoData' : 'Pending enrichment')}`,
        `  WC Version       ${ev.worldcover_version ?? '—'}`,
        `  Ingested         ${ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}`,
        '',
        '  ► Event selected. Navigate to /risk for full analysis.',
        '',
      ].join('\n')
      return [ok(t)]
    }

    case 'satellites': {
      const sats = [...new Set(events.map(e => e.satellite).filter(Boolean))] as string[]
      if (sats.length === 0) return [err('  No satellite data in current batch.')]
      const counts: Record<string, number> = {}
      for (const e of events) if (e.satellite) counts[e.satellite] = (counts[e.satellite] ?? 0) + 1
      const rows = sats
        .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
        .map(s => `  ${s.padEnd(18)}  ${(counts[s] ?? 0).toLocaleString().padStart(10)} detections`)
        .join('\n')
      return [ok(`\n  Active Satellite Platforms (${sats.length})\n  ${'─'.repeat(42)}\n${rows}\n`)]
    }

    case 'sources': {
      const sc: Record<string, number> = {}
      for (const e of events) { const s = e.firms_source ?? 'unknown'; sc[s] = (sc[s] ?? 0) + 1 }
      const rows = Object.entries(sc)
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => `  ${s.padEnd(22)}  ${c.toLocaleString().padStart(10)} detections`)
        .join('\n')
      return rows ? [ok(`\n  FIRMS Sources\n  ${'─'.repeat(42)}\n${rows}\n`)] : [err('  No source data available.')]
    }

    case 'stats': {
      const s = stats as {
        total_detections?: number; detections_today?: number; detections_last_7d?: number
        avg_frp?: number | null; max_frp?: number | null; avg_brightness?: number | null
        last_sync_at?: string | null
      } | null
      if (!s) return [err('  Statistics unavailable — backend may be offline.')]
      const t = [
        '',
        '  DETECTION STATISTICS',
        `  ${'─'.repeat(50)}`,
        `  Total detections     ${(s.total_detections ?? 0).toLocaleString()}`,
        `  Today                ${(s.detections_today ?? 0).toLocaleString()}`,
        `  Last 7 days          ${(s.detections_last_7d ?? 0).toLocaleString()}`,
        `  Average FRP          ${s.avg_frp != null ? `${s.avg_frp.toFixed(1)} MW` : '—'}`,
        `  Peak FRP             ${s.max_frp != null ? `${s.max_frp.toLocaleString()} MW` : '—'}`,
        `  Avg brightness       ${s.avg_brightness != null ? `${s.avg_brightness.toFixed(1)} K` : '—'}`,
        `  Last sync            ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : '—'}`,
        '',
      ].join('\n')
      return [ok(t)]
    }

    case 'pipeline': {
      const ps = pipeline as {
        status?: string
        firms?: { total_records?: number; latest_acquisition_date?: string | null; latest_sync_at?: string | null; new_records_24h?: number }
        worldcover?: { enriched?: number; pending?: number; version?: string }
      } | null
      if (!ps) return [err('  Pipeline status unavailable.')]
      const f = ps.firms; const wc = ps.worldcover
      const t = [
        '',
        `  PIPELINE STATUS  ·  ${(ps.status ?? '—').toUpperCase()}`,
        `  ${'─'.repeat(50)}`,
        '',
        '  FIRMS Ingest',
        `    Total records        ${f?.total_records?.toLocaleString() ?? '—'}`,
        `    Latest acq. date     ${f?.latest_acquisition_date ?? '—'}`,
        `    Last sync            ${f?.latest_sync_at ? new Date(f.latest_sync_at).toLocaleString() : '—'}`,
        `    New (24h)            ${f?.new_records_24h?.toLocaleString() ?? '—'}`,
        '',
        '  WorldCover Enrichment',
        `    Enriched             ${wc?.enriched?.toLocaleString() ?? '—'}`,
        `    Pending              ${wc?.pending?.toLocaleString() ?? '—'}`,
        `    Version              ${wc?.version ?? '—'}`,
        '',
      ].join('\n')
      return [ok(t)]
    }

    case '': return []

    default: return [err(`  Unknown command: '${cmd}'.  Type 'help' for available commands.`)]
  }
}

const INITIAL: Line[] = [
  { id: mkId(), type: 'system', text: BANNER },
  { id: mkId(), type: 'dim',    text: `  Session opened: ${new Date().toUTCString()}\n` },
]

export default function TerminalPage() {
  const { events, pipelineStatus, statistics, setSelectedEvent } = useContext(AppContext)
  const [lines, setLines]     = useState<Line[]>(INITIAL)
  const [input, setInput]     = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  function submit() {
    const t = input.trim()
    if (!t) return
    const result = processCommand(t, events, setSelectedEvent, pipelineStatus, statistics)
    if (result.some(l => l.text === '__CLEAR__')) {
      setLines([{ id: mkId(), type: 'system', text: '  Terminal cleared.\n' }])
    } else {
      const inputLine: Line = { id: mkId(), type: 'input', text: t }
      setLines(prev => [...prev, inputLine, ...result])
    }
    setHistory(prev => [t, ...prev.slice(0, 49)])
    setHistIdx(-1)
    setInput('')
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { submit() }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const n = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(n); setInput(history[n] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const n = Math.max(histIdx - 1, -1)
      setHistIdx(n); setInput(n === -1 ? '' : (history[n] ?? ''))
    }
  }

  const lineColor = (type: Line['type']): string => {
    switch (type) {
      case 'input':   return 'var(--cyan)'
      case 'error':   return '#F87171'
      case 'success': return '#8FBED4'
      case 'system':  return '#4A6A82'
      case 'dim':     return 'var(--t4)'
      default:        return '#6B8EA8'
    }
  }

  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--d0)', overflow: 'hidden',
        cursor: 'text',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* ── Console titlebar ── */}
      <div style={{
        padding: '6px 14px',
        background: 'var(--d2)',
        borderBottom: '1px solid var(--b1)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        {/* Traffic lights */}
        <div style={{ display: 'flex', gap: 5 }}>
          {['#EF4444', '#F59E0B', '#22C55E'].map(c => (
            <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.75 }}/>
          ))}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          color: 'var(--t3)', letterSpacing: '0.08em',
        }}>
          thermalwatch — analyst terminal
        </span>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="live-dot" style={{ width: 5, height: 5 }}/>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)', letterSpacing: '0.06em' }}>
            {events.length.toLocaleString()} events · live
          </span>
        </div>
      </div>

      {/* ── Scan-line top accent ── */}
      <div style={{
        height: 1, flexShrink: 0,
        background: 'linear-gradient(90deg, transparent, rgba(29,232,227,0.4), transparent)',
      }}/>

      {/* ── Output area ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '14px 0 6px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        lineHeight: 1.65,
        letterSpacing: '0.01em',
      }}>
        {lines.map(line => (
          <div key={line.id} style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: lineColor(line.type),
            padding: '0 18px',
          }}>
            {line.type === 'input' ? (
              <span>
                <span style={{ color: 'var(--t4)' }}>tw</span>
                <span style={{ color: 'var(--b3)' }}> › </span>
                <span style={{ color: 'var(--cyan)' }}>{line.text}</span>
              </span>
            ) : line.text}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* ── Input row ── */}
      <div style={{
        padding: '7px 18px 10px',
        borderTop: '1px solid var(--b1)',
        background: 'var(--d2)',
        display: 'flex', alignItems: 'center', gap: 7,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--t4)' }}>tw</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--b3)' }}>›</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Enter command…"
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-mono)', fontSize: 11.5,
            color: 'var(--cyan)', caretColor: 'var(--cyan)',
            letterSpacing: '0.01em',
          }}
        />
      </div>
    </div>
  )
}
