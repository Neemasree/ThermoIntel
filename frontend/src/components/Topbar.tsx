import React, { useState, useEffect, useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Loader } from 'lucide-react'
import { AppContext } from '../App'

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':           { title: 'Global Map',           sub: 'Real-time satellite fire intelligence' },
  '/map':        { title: 'Global Map',           sub: 'Real-time satellite fire intelligence' },
  '/explorer':   { title: 'Event Explorer',       sub: 'Global thermal detection overview' },
  '/risk':       { title: 'Risk Assessment',      sub: 'Individual fire investigation' },
  '/analytics':  { title: 'Analytics',            sub: 'Aggregate thermal intelligence' },
  '/facilities': { title: 'Facilities',           sub: 'Infrastructure proximity analysis' },
  '/history':    { title: 'Observation Log',      sub: 'FIRMS detection archive' },
  '/terminal':   { title: 'Analyst Terminal',     sub: 'Technical command interface' },
  '/explain':    { title: 'SHAP Explainability',  sub: 'Feature importance for individual events' },
}

function useUtcClock() {
  const [t, setT] = useState(() => new Date().toUTCString().slice(17, 25))
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toUTCString().slice(17, 25)), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

export default function Topbar() {
  const location = useLocation()
  const utc = useUtcClock()
  const { status, events, statistics, lastUpdatedAt, refresh } = useContext(AppContext)
  const page = PAGE_META[location.pathname] ?? { title: 'ThermalWatch', sub: '' }

  const lastSync = lastUpdatedAt
    ? lastUpdatedAt.toUTCString().slice(17, 25)
    : null

  return (
    <header style={{
      height: 'var(--topbar-h)',
      background: 'var(--d2)',
      borderBottom: '1px solid var(--b1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 16,
      flexShrink: 0,
      position: 'relative',
      zIndex: 50,
    }}>
      {/* Top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, var(--cyan) 0%, rgba(29,232,227,0.3) 40%, transparent 70%)',
      }}/>

      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          {page.title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--t4)', whiteSpace: 'nowrap', display: 'none' }}>
          {page.sub}
        </span>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Telemetry strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

        {/* Status chip */}
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Loader size={10} color="var(--sky)" style={{ animation: 'spin 0.9s linear infinite' }}/>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sky)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>LOADING</span>
          </div>
        )}
        {(status === 'live' || status === 'empty') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="live-dot" style={{ width: 6, height: 6 }}/>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>LIVE</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--err)' }}/>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--err)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>OFFLINE</span>
          </div>
        )}

        <div className="tel-sep"/>

        {/* Event count */}
        {statistics?.total_detections != null && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>TOTAL</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {statistics.total_detections.toLocaleString()}
              </span>
            </div>
            <div className="tel-sep"/>
          </>
        )}

        {/* Loaded */}
        {status === 'live' && events.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>LOADED</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {events.length.toLocaleString()}
              </span>
            </div>
            <div className="tel-sep"/>
          </>
        )}

        {/* Last sync */}
        {lastSync && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>SYNC</span>
              <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{lastSync}</span>
            </div>
            <div className="tel-sep"/>
          </>
        )}

        {/* UTC clock */}
        <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
          {utc} UTC
        </span>

        <div className="tel-sep"/>

        {/* Refresh */}
        <button
          onClick={refresh}
          title="Refresh now"
          style={{
            background: 'none', border: '1px solid var(--b1)', borderRadius: 5,
            padding: '4px 7px', cursor: 'pointer', color: 'var(--t3)',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all var(--ease)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--cyan)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--cyan)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--b1)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)' }}
        >
          <RefreshCw size={11}/>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>SYNC</span>
        </button>
      </div>
    </header>
  )
}
