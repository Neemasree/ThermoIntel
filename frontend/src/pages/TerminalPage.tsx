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

/* ── Banner & help strings — all chars are genuine UTF-8 literals ── */
const BANNER = [
  '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
  '\u2551  THERMALWATCH \u00b7 Analyst Terminal \u00b7 v4.0                  \u2551',
  '\u2551  Satellite Thermal Intelligence Platform               \u2551',
  '\u2551  Backend: FIRMS / VIIRS / MODIS pipeline               \u2551',
  '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d',
  '',
  '  Type  help  for available commands.',
  '',
].join('\n')

const DASH48 = '\u2500'.repeat(48)
const DASH50 = '\u2500'.repeat(50)
const DASH52 = '\u2500'.repeat(52)
const DASH42 = '\u2500'.repeat(42)
const DASH66 = '\u2500'.repeat(66)

const HELP = [
  '  AVAILABLE COMMANDS',
  '  ' + DASH48,
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

  const out = (t: string, type: Line['type'] = 'output'): Line => ({ id: mkId(), type, text: t })
  const err = (t: string) => out(t, 'error')
  const ok  = (t: string) => out(t, 'success')

  switch (cmd) {
    case 'help':  return [ok(HELP)]
    case 'clear': return [{ id: mkId(), type: 'system', text: '__CLEAR__' }]

    case 'list': {
      if (!events.length) return [err('  No events loaded. Backend may be offline.')]
      const header = `\n  Loaded batch: ${events.length.toLocaleString()} events\n  ${DASH66}`
      const rows = events.slice(0, 60).map(e => {
        const id  = (e.event_id ?? '\u2014').padEnd(28)
        const sat = (e.satellite ?? '\u2014').padEnd(10)
        const frp = e.frp != null ? `${e.frp.toLocaleString()} MW`.padStart(11) : '          \u2014'
        return `  ${id}  ${sat}  ${frp}  ${e.acquisition_date ?? '\u2014'}`
      }).join('\n')
      const more = events.length > 60 ? `\n  \u2026 and ${events.length - 60} more` : ''
      return [ok(`${header}\n${rows}${more}`)]
    }

    case 'inspect': {
      if (!arg) return [err('  Usage: inspect <EVENT_ID>')]
      const ev = events.find(e => e.event_id === arg)
      if (!ev) {
        const close = events.filter(e => e.event_id?.toLowerCase().includes(arg.toLowerCase())).slice(0, 5)
        const hint = close.length ? `\n\n  Close matches:\n${close.map(e => `    ${e.event_id}`).join('\n')}` : ''
        return [err(`  Event not found: ${arg}${hint}`)]
      }
      setSelectedEvent(ev)
      return [ok([
        '',
        `  EVENT RECORD  \u00b7  ${ev.event_id}`,
        `  ${DASH52}`,
        `  Latitude         ${ev.latitude}`,
        `  Longitude        ${ev.longitude}`,
        `  Date             ${ev.acquisition_date ?? '\u2014'}`,
        `  Time             ${formatAcqTime(ev.acquisition_time)}`,
        `  Satellite        ${ev.satellite ?? '\u2014'}`,
        `  Instrument       ${ev.instrument ?? '\u2014'}`,
        `  FIRMS Source     ${ev.firms_source ?? '\u2014'}`,
        `  FRP              ${ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '\u2014'}`,
        `  Brightness       ${ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '\u2014'}`,
        `  Confidence       ${confidenceLabel(ev.confidence)}`,
        `  FRP Tier         ${frpTier(ev.frp)}`,
        `  Day / Night      ${ev.daynight ?? '\u2014'}`,
        `  Land Cover       ${ev.worldcover_class_name ?? (ev.worldcover_version ? 'NoData' : 'Pending enrichment')}`,
        `  WC Version       ${ev.worldcover_version ?? '\u2014'}`,
        `  Ingested         ${ev.created_at ? new Date(ev.created_at).toLocaleString() : '\u2014'}`,
        '',
        '  \u25ba Event selected. Navigate to /risk for full analysis.',
        '',
      ].join('\n'))]
    }

    case 'satellites': {
      const sats = [...new Set(events.map(e => e.satellite).filter(Boolean))] as string[]
      if (!sats.length) return [err('  No satellite data in current batch.')]
      const counts: Record<string, number> = {}
      for (const e of events) if (e.satellite) counts[e.satellite] = (counts[e.satellite] ?? 0) + 1
      const rows = sats
        .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
        .map(s => `  ${s.padEnd(18)}  ${(counts[s] ?? 0).toLocaleString().padStart(10)} detections`)
        .join('\n')
      return [ok(`\n  Active Satellite Platforms (${sats.length})\n  ${DASH42}\n${rows}\n`)]
    }

    case 'sources': {
      const sc: Record<string, number> = {}
      for (const e of events) { const s = e.firms_source ?? 'unknown'; sc[s] = (sc[s] ?? 0) + 1 }
      const rows = Object.entries(sc)
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => `  ${s.padEnd(22)}  ${c.toLocaleString().padStart(10)} detections`)
        .join('\n')
      return rows ? [ok(`\n  FIRMS Sources\n  ${DASH42}\n${rows}\n`)] : [err('  No source data available.')]
    }

    case 'stats': {
      const s = stats as {
        total_detections?: number; detections_today?: number; detections_last_7d?: number
        avg_frp?: number | null; max_frp?: number | null; avg_brightness?: number | null
        last_sync_at?: string | null
      } | null
      if (!s) return [err('  Statistics unavailable \u2014 backend may be offline.')]
      return [ok([
        '',
        '  DETECTION STATISTICS',
        `  ${DASH50}`,
        `  Total detections     ${(s.total_detections ?? 0).toLocaleString()}`,
        `  Today                ${(s.detections_today ?? 0).toLocaleString()}`,
        `  Last 7 days          ${(s.detections_last_7d ?? 0).toLocaleString()}`,
        `  Average FRP          ${s.avg_frp != null ? `${s.avg_frp.toFixed(1)} MW` : '\u2014'}`,
        `  Peak FRP             ${s.max_frp != null ? `${s.max_frp.toLocaleString()} MW` : '\u2014'}`,
        `  Avg brightness       ${s.avg_brightness != null ? `${s.avg_brightness.toFixed(1)} K` : '\u2014'}`,
        `  Last sync            ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : '\u2014'}`,
        '',
      ].join('\n'))]
    }

    case 'pipeline': {
      const ps = pipeline as {
        status?: string
        firms?: { total_records?: number; latest_acquisition_date?: string | null; latest_sync_at?: string | null; new_records_24h?: number }
        worldcover?: { enriched?: number; pending?: number; version?: string }
      } | null
      if (!ps) return [err('  Pipeline status unavailable.')]
      const f = ps.firms; const wc = ps.worldcover
      return [ok([
        '',
        `  PIPELINE STATUS  \u00b7  ${(ps.status ?? '\u2014').toUpperCase()}`,
        `  ${DASH50}`,
        '',
        '  FIRMS Ingest',
        `    Total records        ${f?.total_records?.toLocaleString() ?? '\u2014'}`,
        `    Latest acq. date     ${f?.latest_acquisition_date ?? '\u2014'}`,
        `    Last sync            ${f?.latest_sync_at ? new Date(f.latest_sync_at).toLocaleString() : '\u2014'}`,
        `    New (24h)            ${f?.new_records_24h?.toLocaleString() ?? '\u2014'}`,
        '',
        '  WorldCover Enrichment',
        `    Enriched             ${wc?.enriched?.toLocaleString() ?? '\u2014'}`,
        `    Pending              ${wc?.pending?.toLocaleString() ?? '\u2014'}`,
        `    Version              ${wc?.version ?? '\u2014'}`,
        '',
      ].join('\n'))]
    }

    case '':      return []
    default:      return [err(`  Unknown command: '${cmd}'.  Type 'help' for available commands.`)]
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
      setLines(prev => [...prev, { id: mkId(), type: 'input', text: t }, ...result])
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
      case 'input':   return 'var(--cyan)'      /* live/ops = cyan */
      case 'error':   return 'var(--err)'       /* error = red */
      case 'success': return '#9ABECF'
      case 'system':  return '#4A6A82'
      case 'dim':     return 'var(--t4)'
      default:        return '#6B8EA8'
    }
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--d0)', overflow: 'hidden', cursor: 'text' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div style={{ padding: '7px 16px', background: 'var(--d2)', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#EF4444', '#F59E0B', '#22C55E'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.8 }}/>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t3)', letterSpacing: '0.06em' }}>
          thermalwatch \u2014 analyst terminal
        </span>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="live-dot" style={{ width: 6, height: 6 }}/>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t4)' }}>
            {events.length.toLocaleString()} events \u00b7 live
          </span>
        </div>
      </div>

      {/* Scan accent */}
      <div style={{ height: 1, flexShrink: 0, background: 'linear-gradient(90deg, transparent, rgba(0,229,220,0.5), transparent)' }}/>

      {/* Output */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 0 6px', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7 }}>
        {lines.map(line => (
          <div key={line.id} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: lineColor(line.type), padding: '0 20px' }}>
            {line.type === 'input' ? (
              <span>
                <span style={{ color: 'var(--t4)' }}>tw</span>
                <span style={{ color: 'var(--t3)' }}> \u203a </span>
                <span style={{ color: 'var(--cyan)' }}>{line.text}</span>
              </span>
            ) : line.text}
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{ padding: '8px 20px 12px', borderTop: '1px solid var(--b1)', background: 'var(--d2)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t4)' }}>tw</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--t3)' }}>\u203a</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Enter command\u2026"
          spellCheck={false}
          autoComplete="off"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--cyan)', caretColor: 'var(--cyan)' }}
        />
      </div>
    </div>
  )
}
