import React, { useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Globe, Shield, BarChart2, Building2, Clock, Terminal } from 'lucide-react'
import { AppContext } from '../App'

const NAV = [
  { to: '/map',        icon: Globe,      label: 'Global Map',  short: 'MAP'  },
  { to: '/risk',       icon: Shield,     label: 'Risk',        short: 'RISK' },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics',   short: 'ANLY' },
  { to: '/facilities', icon: Building2,  label: 'Facilities',  short: 'FAC'  },
  { to: '/history',    icon: Clock,      label: 'History',     short: 'LOG'  },
  { to: '/terminal',   icon: Terminal,   label: 'Terminal',    short: 'TERM' },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const { pipelineStatus } = useContext(AppContext)

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)

  const pipelineOk    = pipelineStatus?.status === 'ok'
  const pipelineReady = pipelineStatus != null
  const sysColor = !pipelineReady ? 'var(--t3)' : pipelineOk ? 'var(--ok)' : 'var(--err)'
  const sysLabel = !pipelineReady ? 'CONNECTING' : pipelineOk ? 'OPERATIONAL' : 'DEGRADED'

  return (
    <nav style={{
      width: 'var(--sidebar-w)',
      minWidth: 'var(--sidebar-w)',
      flexShrink: 0,
      background: 'var(--d2)',
      borderRight: '1px solid var(--b1)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Subtle grid texture overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(29,232,227,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(29,232,227,0.018) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        zIndex: 0,
      }}/>

      {/* ── Wordmark ── */}
      <div style={{
        height: 'var(--topbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '0 16px',
        borderBottom: '1px solid var(--b1)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* ThermalWatch logomark — orbital thermal wave */}
        <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
          <svg viewBox="0 0 26 26" width="26" height="26" style={{ position: 'absolute', inset: 0 }}>
            {/* Outer orbit ring */}
            <circle cx="13" cy="13" r="11" fill="none" stroke="rgba(29,232,227,0.18)" strokeWidth="0.8"/>
            {/* Mid ring */}
            <circle cx="13" cy="13" r="7.5" fill="none" stroke="rgba(29,232,227,0.28)" strokeWidth="0.8"/>
            {/* Rotating scanner arc */}
            <circle cx="13" cy="13" r="11" fill="none"
              stroke="rgba(29,232,227,0.7)" strokeWidth="1"
              strokeDasharray="8 60"
              strokeLinecap="round"
              style={{ animation: 'orbitScan 6s linear infinite', transformOrigin: '13px 13px' }}/>
            {/* Thermal core gradient */}
            <defs>
              <radialGradient id="tw-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#F97316" stopOpacity="1"/>
                <stop offset="60%"  stopColor="#EF4444" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="13" cy="13" r="4" fill="url(#tw-core)"/>
            {/* Tick marks at cardinals */}
            {[0,90,180,270].map(angle => {
              const r = angle * Math.PI / 180
              const x1 = 13 + 10.5 * Math.cos(r); const y1 = 13 + 10.5 * Math.sin(r)
              const x2 = 13 + 12   * Math.cos(r); const y2 = 13 + 12   * Math.sin(r)
              return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(29,232,227,0.5)" strokeWidth="1"/>
            })}
          </svg>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--t1)',
            lineHeight: 1.1,
            fontFamily: 'var(--font-sans)',
          }}>
            THERMAL
          </div>
          <div style={{
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.22em',
            color: 'var(--cyan)',
            lineHeight: 1.1,
            fontFamily: 'var(--font-mono)',
          }}>
            WATCH
          </div>
        </div>

        {/* Version chip */}
        <div style={{
          marginLeft: 'auto',
          fontSize: 7, fontWeight: 700,
          letterSpacing: '0.10em',
          color: 'var(--t4)',
          fontFamily: 'var(--font-mono)',
          border: '1px solid var(--b1)',
          borderRadius: 2,
          padding: '1px 4px',
        }}>
          v4
        </div>
      </div>

      {/* ── Section label ── */}
      <div style={{
        padding: '10px 16px 4px',
        fontSize: 8, fontWeight: 700,
        letterSpacing: '0.16em',
        color: 'var(--t4)',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
        position: 'relative', zIndex: 1,
      }}>
        Navigation
      </div>

      {/* ── Nav rail ── */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        padding: '2px 8px 8px',
        gap: 1,
        position: 'relative', zIndex: 1,
      }}>
        {NAV.map(({ to, icon: Icon, label, short }) => {
          const active = isActive(to)
          return (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              <div
                className={active ? 'nav-item-active' : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 'var(--r-sm)',
                  background: active
                    ? 'linear-gradient(135deg, rgba(29,232,227,0.10) 0%, rgba(29,232,227,0.04) 100%)'
                    : 'transparent',
                  border: `1px solid ${active ? 'rgba(29,232,227,0.25)' : 'transparent'}`,
                  color: active ? 'var(--cyan)' : 'var(--t3)',
                  cursor: 'pointer',
                  transition: 'all var(--ease)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = 'rgba(255,255,255,0.04)'
                    el.style.color = 'var(--t2)'
                    el.style.borderColor = 'var(--b2)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = 'transparent'
                    el.style.color = 'var(--t3)'
                    el.style.borderColor = 'transparent'
                  }
                }}
              >
                {/* Active left bar */}
                {active && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 2, height: 20,
                    borderRadius: '0 2px 2px 0',
                    background: 'var(--cyan)',
                    boxShadow: '0 0 6px var(--cyan)',
                  }}/>
                )}
                {/* Active shimmer */}
                {active && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(29,232,227,0.04) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 3s infinite',
                  }}/>
                )}

                <Icon size={14} strokeWidth={active ? 2 : 1.5}/>

                <span style={{
                  fontSize: 'var(--sz-sm)',
                  fontWeight: active ? 600 : 400,
                  letterSpacing: '0.01em',
                  flex: 1,
                }}>
                  {label}
                </span>

                {/* Short code badge */}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  color: active ? 'rgba(29,232,227,0.5)' : 'var(--t4)',
                  transition: 'color var(--ease)',
                }}>
                  {short}
                </span>
              </div>
            </NavLink>
          )
        })}
      </div>

      {/* ── Telemetry divider ── */}
      <div style={{
        margin: '0 10px',
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--b2), transparent)',
      }}/>

      {/* ── System status ── */}
      <div style={{
        padding: '10px 14px 12px',
        flexShrink: 0,
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          fontSize: 7.5, fontWeight: 700,
          letterSpacing: '0.14em',
          color: 'var(--t4)',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          marginBottom: 6,
        }}>
          System Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: sysColor,
            flexShrink: 0,
            boxShadow: pipelineReady && pipelineOk ? `0 0 8px var(--ok)` : 'none',
            animation: pipelineReady && pipelineOk ? 'liveBlip 2.2s ease-in-out infinite' : 'none',
          }}/>
          <span style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '0.10em',
            color: sysColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {sysLabel}
          </span>
        </div>
        {pipelineStatus?.firms?.latest_acquisition_date && (
          <div style={{
            fontSize: 8,
            color: 'var(--t4)',
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
          }}>
            ACQ {pipelineStatus.firms.latest_acquisition_date}
          </div>
        )}
      </div>
    </nav>
  )
}
