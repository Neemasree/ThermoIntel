import React, { useContext, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Globe, Shield, BarChart2, Building2, Clock, Terminal, Cpu } from 'lucide-react'
import { AppContext } from '../App'

const NAV = [
  { to: '/map',        icon: Globe,      label: 'Global Map'     },
  { to: '/explorer',   icon: BarChart2,  label: 'Event Explorer' },
  { to: '/risk',       icon: Shield,     label: 'Risk Assessment'},
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics'      },
  { to: '/facilities', icon: Building2,  label: 'Facilities'     },
  { to: '/history',    icon: Clock,      label: 'Observation Log'},
  { to: '/explain',    icon: Cpu,        label: 'SHAP Explain'   },
  { to: '/terminal',   icon: Terminal,   label: 'Terminal'       },
]

function PipelineRow({ label, status, color }: {
  label: string; status: string; color: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--t4)' }}>{label}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color, fontFamily: 'var(--font-mono)',
      }}>{status}</span>
    </div>
  )
}

export default function Sidebar() {
  const { pathname } = useLocation()
  const { pipelineStatus } = useContext(AppContext)

  const isActive = (to: string) => pathname === to
  const pipelineOk = pipelineStatus?.status === 'ok'
  const ready = pipelineStatus != null

  const firmsOk = ready && (pipelineStatus.firms?.total_records ?? 0) > 0
  const wcOk    = ready && (pipelineStatus.worldcover?.enriched ?? 0) > 0
  const osmEnriched = pipelineStatus?.osm?.enriched ?? 0
  const osmPending  = pipelineStatus?.osm?.pending  ?? 0
  const osmStatus = !ready ? 'CONNECTING' : osmEnriched > 0 ? 'LIVE' : osmPending > 0 ? 'PROCESSING' : 'PENDING'
  const osmColor  = !ready ? 'var(--t4)' : osmEnriched > 0 ? 'var(--ok)' : 'var(--warn)'

  const [mlReady, setMlReady] = useState<boolean | null>(null)
  useEffect(() => {
    const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'
    fetch(`${BASE}/feature-completeness`)
      .then(r => r.json())
      .then((d: { summary?: { fully_ml_ready?: number } }) => setMlReady((d?.summary?.fully_ml_ready ?? 0) > 0))
      .catch(() => setMlReady(false))
  }, [])
  const mlStatus = mlReady === null ? 'CHECKING' : mlReady ? 'LIVE' : 'PENDING'
  const mlColor  = mlReady ? 'var(--ok)' : 'var(--violet)'

  return (
    <nav style={{
      width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)', flexShrink: 0,
      background: 'var(--d2)', borderRight: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column', zIndex: 100, overflow: 'hidden',
    }}>
      {/* ── Wordmark ── */}
      <div style={{
        height: 'var(--topbar-h)', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '0 18px',
        borderBottom: '1px solid var(--b1)', flexShrink: 0,
        position: 'relative',
      }}>
        {/* Cyan accent line */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg, var(--cyan), transparent)' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Orbital fire icon */}
          <svg viewBox="0 0 26 26" width="26" height="26" style={{ flexShrink: 0 }}>
            <circle cx="13" cy="13" r="11" fill="none" stroke="rgba(29,232,227,0.18)" strokeWidth="0.8"/>
            <circle cx="13" cy="13" r="7"  fill="none" stroke="rgba(29,232,227,0.28)" strokeWidth="0.7"/>
            <circle cx="13" cy="13" r="11" fill="none" stroke="rgba(29,232,227,0.75)" strokeWidth="1"
              strokeDasharray="8 60" strokeLinecap="round"
              style={{ animation: 'orbitScan 6s linear infinite', transformOrigin: '13px 13px' }}/>
            <defs>
              <radialGradient id="firecoreS" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#F97316" stopOpacity="1"/>
                <stop offset="70%"  stopColor="#EF4444" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="13" cy="13" r="4" fill="url(#firecoreS)"/>
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--t1)', letterSpacing: '0.08em', lineHeight: 1.1 }}>
              THERMALWATCH
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--cyan)', letterSpacing: '0.20em', lineHeight: 1.1, opacity: 0.85 }}>
              LIVE FIRE INTELLIGENCE
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div style={{ flex: 1, padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          const active = isActive(to)
          return (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: '8px 11px', borderRadius: 7,
                  background: active
                    ? 'linear-gradient(135deg, rgba(29,232,227,0.12), rgba(29,232,227,0.04))'
                    : 'transparent',
                  border: `1px solid ${active ? 'rgba(29,232,227,0.25)' : 'transparent'}`,
                  color: active ? 'var(--cyan)' : 'var(--t3)',
                  cursor: 'pointer', transition: 'all var(--ease)',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'var(--t2)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'var(--t3)'
                  }
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 20, borderRadius: '0 2px 2px 0',
                    background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)',
                  }}/>
                )}
                <Icon size={15} strokeWidth={active ? 2.2 : 1.6}/>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{label}</span>
              </div>
            </NavLink>
          )
        })}
      </div>

      {/* ── System Status Panel ── */}
      <div style={{
        margin: '6px 10px 10px',
        background: 'var(--d3)', border: '1px solid var(--b1)',
        borderRadius: 8, padding: '11px 13px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: !ready ? 'var(--t3)' : pipelineOk ? 'var(--ok)' : 'var(--err)',
            boxShadow: pipelineOk ? '0 0 8px var(--ok)' : 'none',
            animation: pipelineOk ? 'liveBlip 2.2s ease-in-out infinite' : 'none',
          }}/>
          <span style={{ fontSize: 11, fontWeight: 700, color: !ready ? 'var(--t3)' : pipelineOk ? 'var(--ok)' : 'var(--err)' }}>
            {!ready ? 'Connecting…' : pipelineOk ? 'System Operational' : 'Degraded'}
          </span>
        </div>

        <div style={{ borderTop: '1px solid var(--b0)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <PipelineRow
            label="FIRMS Pipeline"
            status={firmsOk ? 'LIVE' : 'CONNECTING'}
            color={firmsOk ? 'var(--ok)' : 'var(--t4)'}
          />
          <PipelineRow
            label="OSM Enrichment"
            status={osmStatus}
            color={osmColor}
          />
          <PipelineRow
            label="WorldCover"
            status={wcOk ? 'LIVE' : 'PROCESSING'}
            color={wcOk ? 'var(--ok)' : 'var(--warn)'}
          />
          <PipelineRow
            label="ML Pipeline"
            status={mlStatus}
            color={mlColor}
          />
        </div>

        {pipelineStatus?.firms?.latest_acquisition_date && (
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--b0)' }}>
            <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              LAST DATA
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {pipelineStatus.firms.latest_acquisition_date}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
