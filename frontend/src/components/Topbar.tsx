import React, { useState, useEffect, useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, AlertTriangle, Wifi, WifiOff } from 'lucide-react'
import { AppContext } from '../App'

/* Live UTC clock */
function useUtcClock() {
  const fmt = () => new Date().toISOString().slice(11, 19)
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

const PAGE_META: Record<string, { module: string; sub: string }> = {
  '/':           { module: 'GLOBAL MAP',      sub: 'Thermal Event Visualization' },
  '/map':        { module: 'GLOBAL MAP',      sub: 'Thermal Event Visualization' },
  '/risk':       { module: 'RISK',            sub: 'Event Intelligence Assessment' },
  '/analytics':  { module: 'ANALYTICS',       sub: 'Detection Statistics' },
  '/facilities': { module: 'FACILITIES',      sub: 'Infrastructure Context' },
  '/history':    { module: 'OBSERVATION LOG', sub: 'Detection Archive' },
  '/terminal':   { module: 'TERMINAL',        sub: 'Analyst Interface' },
}

/* Telemetry segment */
function TelSeg({ label, value, accent }: {
  label: string; value: string; accent?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 'max-content' }}>
      <span style={{
        fontSize: 7, fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--t4)',
        fontFamily: 'var(--font-mono)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: accent ?? 'var(--t2)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.04em',
      }}>
        {value}
      </span>
    </div>
  )
}

export default function Topbar() {
  const { pathname } = useLocation()
  const utc = useUtcClock()
  const { status, lastUpdatedAt, refresh, pipelineStatus, events, statistics } = useContext(AppContext)

  const meta = PAGE_META[pathname] ?? { module: 'THERMALWATCH', sub: 'Satellite Thermal Intelligence' }
  const pipelineOk = pipelineStatus?.status === 'ok'

  const lastSync = statistics?.last_sync_at
    ? new Date(statistics.last_sync_at).toISOString().slice(11, 19)
    : null

  return (
    <header style={{
      height: 'var(--topbar-h)',
      minHeight: 'var(--topbar-h)',
      background: 'var(--d2)',
      borderBottom: '1px solid var(--b1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      zIndex: 50,
      flexShrink: 0,
      position: 'relative',
      gap: 0,
    }}>
      {/* Gradient top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, var(--cyan) 0%, rgba(29,232,227,0.4) 40%, var(--violet) 80%, transparent 100%)',
        opacity: 0.6,
      }}/>

      {/* Module identification */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          letterSpacing: '0.14em',
          color: 'var(--t1)',
          fontFamily: 'var(--font-mono)',
        }}>
          {meta.module}
        </span>
        <span style={{
          fontSize: 9, color: 'var(--t4)',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.01em',
        }}>
          {meta.sub}
        </span>
      </div>

      <div style={{ flex: 1 }}/>

      {/* ── Telemetry row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Connection / pipeline status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {status === 'loading' && (
            <div style={{
              width: 12, height: 12,
              border: '1.5px solid var(--sky)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }}/>
          )}
          {(status === 'live' || status === 'empty') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="live-dot" style={{ width: 6, height: 6 }}/>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                fontWeight: 700, letterSpacing: '0.10em',
                color: 'var(--cyan)',
              }}>
                LIVE
              </span>
            </div>
          )}
          {status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <WifiOff size={11} color="var(--err)"/>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                fontWeight: 700, letterSpacing: '0.10em', color: 'var(--err)',
              }}>
                OFFLINE
              </span>
            </div>
          )}
        </div>

        <div className="tel-sep"/>

        {/* Pipeline */}
        {pipelineStatus && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: pipelineOk ? 'var(--ok)' : 'var(--err)',
                boxShadow: pipelineOk ? '0 0 5px var(--ok)' : 'none',
                flexShrink: 0,
              }}/>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                fontWeight: 600, letterSpacing: '0.09em',
                color: pipelineOk ? 'var(--t3)' : 'var(--err)',
              }}>
                PIPELINE {pipelineOk ? 'OK' : 'ERR'}
              </span>
            </div>
            <div className="tel-sep"/>
          </>
        )}

        {/* Last sync */}
        {lastSync && <TelSeg label="Last Sync" value={`${lastSync} UTC`}/>}
        {lastSync && <div className="tel-sep"/>}

        {/* Events count */}
        {events.length > 0 && (
          <>
            <TelSeg label="Loaded" value={events.length.toLocaleString()} accent="var(--t1)"/>
            <div className="tel-sep"/>
          </>
        )}

        {/* Mission clock */}
        <TelSeg label="Mission Time" value={`${utc} UTC`} accent="var(--cyan)"/>

        <div className="tel-sep"/>

        {/* Refresh */}
        <button
          className="btn"
          onClick={refresh}
          title="Refresh telemetry"
          style={{ padding: '3px 8px', gap: 4, borderRadius: 'var(--r-sm)' }}
        >
          <RefreshCw size={10}/>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            SYNC
          </span>
        </button>
      </div>
    </header>
  )
}
