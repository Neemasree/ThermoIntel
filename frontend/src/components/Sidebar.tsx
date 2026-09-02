import React, { useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Globe, Shield, BarChart2, Building2, Clock, Terminal } from 'lucide-react'
import { AppContext } from '../App'

const NAV = [
  { to: '/map',        icon: Globe,      label: 'Global Map'  },
  { to: '/risk',       icon: Shield,     label: 'Risk'        },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics'   },
  { to: '/facilities', icon: Building2,  label: 'Facilities'  },
  { to: '/history',    icon: Clock,      label: 'History'     },
  { to: '/terminal',   icon: Terminal,   label: 'Terminal'    },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const { pipelineStatus } = useContext(AppContext)

  const isActive = (to: string) => pathname === to || (to !== '/' && pathname.startsWith(to))
  const ok    = pipelineStatus?.status === 'ok'
  const ready = pipelineStatus != null

  return (
    <nav style={{
      width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)', flexShrink: 0,
      background: 'var(--d2)', borderRight: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column', zIndex: 100, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
          <svg viewBox="0 0 28 28" width="28" height="28">
            <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(0,229,220,0.22)" strokeWidth="1"/>
            <circle cx="14" cy="14" r="8"  fill="none" stroke="rgba(0,229,220,0.32)" strokeWidth="0.8"/>
            <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(0,229,220,0.80)" strokeWidth="1.2"
              strokeDasharray="9 66" strokeLinecap="round"
              style={{ animation: 'orbitScan 6s linear infinite', transformOrigin: '14px 14px' }}/>
            <defs>
              <radialGradient id="sg" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#F97316" stopOpacity="1"/>
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="14" cy="14" r="4.5" fill="url(#sg)"/>
          </svg>
        </div>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--t1)', letterSpacing: '0.06em' }}>THERMAL</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.22em' }}>WATCH</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          const active = isActive(to)
          return (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 12px', borderRadius: 8,
                  background: active ? 'linear-gradient(135deg,rgba(0,229,220,0.13),rgba(0,229,220,0.05))' : 'transparent',
                  border: `1px solid ${active ? 'rgba(0,229,220,0.28)' : 'transparent'}`,
                  color: active ? 'var(--cyan)' : 'var(--t3)',
                  cursor: 'pointer', transition: 'all var(--ease)',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'var(--t2)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b2)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'var(--t3)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'
                  }
                }}
              >
                {active && (
                  <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 22, borderRadius: '0 2px 2px 0', background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)' }}/>
                )}
                <Icon size={16} strokeWidth={active ? 2.2 : 1.6}/>
                <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{label}</span>
              </div>
            </NavLink>
          )
        })}
      </div>

      {/* Status */}
      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--b1)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 8 }}>System</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: !ready ? 'var(--t3)' : ok ? 'var(--ok)' : 'var(--err)', boxShadow: ready && ok ? '0 0 8px var(--ok)' : 'none', animation: ready && ok ? 'liveBlip 2.2s ease-in-out infinite' : 'none' }}/>
          <span style={{ fontSize: 13, fontWeight: 600, color: !ready ? 'var(--t3)' : ok ? 'var(--ok)' : 'var(--err)' }}>
            {!ready ? 'Connecting…' : ok ? 'Operational' : 'Degraded'}
          </span>
        </div>
        {pipelineStatus?.firms?.latest_acquisition_date && (
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>
            Last data: {pipelineStatus.firms.latest_acquisition_date}
          </div>
        )}
      </div>
    </nav>
  )
}
