import React, { useState, useEffect, useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, WifiOff, Wifi } from 'lucide-react'
import { AppContext } from '../App'

function useUtcClock() {
  const fmt = () => new Date().toISOString().slice(11, 19)
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

const PAGE_NAMES: Record<string, string> = {
  '/':           'Global Map',
  '/map':        'Global Map',
  '/risk':       'Risk Assessment',
  '/analytics':  'Analytics',
  '/facilities': 'Facilities',
  '/history':    'Observation Log',
  '/terminal':   'Terminal',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const utc = useUtcClock()
  const { status, refresh, pipelineStatus, events, statistics } = useContext(AppContext)

  const pipelineOk = pipelineStatus?.status === 'ok'
  const lastSync = statistics?.last_sync_at
    ? new Date(statistics.last_sync_at).toISOString().slice(11, 19) + ' UTC'
    : null

  return (
    <header style={{
      height: 'var(--topbar-h)', minHeight: 'var(--topbar-h)',
      background: 'var(--d2)', borderBottom: '1px solid var(--b1)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', zIndex: 50, flexShrink: 0, position: 'relative',
    }}>
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--cyan) 0%, rgba(0,229,220,0.3) 50%, transparent 100%)', opacity: 0.7 }}/>

      {/* Page name */}
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
        {PAGE_NAMES[pathname] ?? 'ThermalWatch'}
      </span>

      <div style={{ flex: 1 }}/>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

        {/* Connection status */}
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 13, height: 13, border: '2px solid var(--sky)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            <span style={{ fontSize: 12, color: 'var(--sky)', fontWeight: 500 }}>Connecting…</span>
          </div>
        )}
        {(status === 'live' || status === 'empty') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="live-dot" style={{ width: 7, height: 7 }}/>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)' }}>Live</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <WifiOff size={14} color="var(--err)"/>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--err)' }}>Offline</span>
          </div>
        )}

        <div style={{ width: 1, height: 16, background: 'var(--b1)' }}/>

        {/* Pipeline */}
        {pipelineStatus && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: pipelineOk ? 'var(--ok)' : 'var(--err)', boxShadow: pipelineOk ? '0 0 6px var(--ok)' : 'none' }}/>
              <span style={{ fontSize: 12, color: pipelineOk ? 'var(--t3)' : 'var(--err)', fontWeight: 500 }}>
                {pipelineOk ? 'Pipeline OK' : 'Pipeline Error'}
              </span>
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--b1)' }}/>
          </>
        )}

        {/* Events loaded */}
        {events.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--t1)' }}>{events.length.toLocaleString()}</span> events
            </span>
            <div style={{ width: 1, height: 16, background: 'var(--b1)' }}/>
          </>
        )}

        {/* UTC clock */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--cyan)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {utc} <span style={{ color: 'var(--t4)', fontWeight: 400, fontSize: 11 }}>UTC</span>
        </span>

        <div style={{ width: 1, height: 16, background: 'var(--b1)' }}/>

        <button className="btn" onClick={refresh} style={{ gap: 6, fontSize: 12, padding: '5px 12px' }}>
          <RefreshCw size={12}/> Sync
        </button>
      </div>
    </header>
  )
}
