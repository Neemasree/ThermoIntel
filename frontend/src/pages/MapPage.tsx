import React, { useState } from 'react'
import { Layers, ChevronDown, ChevronUp, List } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor } from '../utils/eventUtils'
import EventInspector from '../components/EventInspector'
import MapPanel from '../components/MapPanel'

export default function MapPage() {
  const { events, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const [showEvents,   setShowEvents]   = useState(true)
  const [layerOpen,    setLayerOpen]    = useState(true)
  const [eventsOpen,   setEventsOpen]   = useState(true)

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* ── Map ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <MapPanel
          events={showEvents ? events : []}
          selectedEvent={selectedEvent}
          onSelect={setSelectedEvent}
          status={status}
          error={error}
        />

        {/* Single unified floating left panel — avoids panel-on-panel collision */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 600,
          background: 'rgba(12,12,12,0.93)',
          border: '1px solid var(--b2)',
          borderRadius: 10,
          backdropFilter: 'blur(14px)',
          boxShadow: 'var(--sh-lg)',
          width: 210,
          maxHeight: 'calc(100% - 80px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* ── Section 1: Layers ── */}
          <div
            onClick={() => setLayerOpen(o => !o)}
            style={{
              padding: '9px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
              borderBottom: '1px solid var(--b1)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Layers size={13} color="var(--t3)"/>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Map Layers</span>
            </div>
            {layerOpen
              ? <ChevronUp size={11} color="var(--t4)"/>
              : <ChevronDown size={11} color="var(--t4)"/>}
          </div>

          {layerOpen && (
            <div style={{ padding: '7px 10px 9px', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
              {/* Fire events toggle */}
              <div
                onClick={() => setShowEvents(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', cursor: 'pointer', borderRadius: 6,
                  background: showEvents ? 'rgba(245,158,11,0.10)' : 'transparent',
                  border: `1px solid ${showEvents ? 'rgba(245,158,11,0.28)' : 'transparent'}`,
                  transition: 'all var(--ease)',
                  marginBottom: 2,
                }}
              >
                <div style={{
                  width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                  background: showEvents ? 'var(--amber)' : 'transparent',
                  border: `1.5px solid var(--amber)`,
                  boxShadow: showEvents ? '0 0 6px rgba(245,158,11,0.5)' : 'none',
                  transition: 'all var(--ease)',
                }}/>
                <span style={{ fontSize: 13, color: showEvents ? 'var(--t1)' : 'var(--t4)', flex: 1 }}>
                  Fire Events
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: showEvents ? 'var(--amber)' : 'var(--t4)' }}>
                  {events.length.toLocaleString()}
                </span>
              </div>

              {/* Pending layers */}
              <div style={{ opacity: 0.32, pointerEvents: 'none' }}>
                {['Facility Overlay', 'Satellite Coverage'].map(l => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
                    <div style={{ width: 11, height: 11, borderRadius: 3, border: '1.5px solid var(--b2)', flexShrink: 0 }}/>
                    <span style={{ fontSize: 12, color: 'var(--t4)', flex: 1 }}>{l}</span>
                    <span style={{ fontSize: 10, color: 'var(--t4)' }}>Soon</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 2: Event list ── */}
          <div
            onClick={() => setEventsOpen(o => !o)}
            style={{
              padding: '8px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
              borderBottom: eventsOpen ? '1px solid var(--b1)' : 'none',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <List size={13} color="var(--t3)"/>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Events</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>
                {events.length.toLocaleString()}
              </span>
            </div>
            {eventsOpen
              ? <ChevronUp size={11} color="var(--t4)"/>
              : <ChevronDown size={11} color="var(--t4)"/>}
          </div>

          {eventsOpen && (
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {events.length === 0 && (
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--t4)', textAlign: 'center' }}>
                  No events loaded
                </div>
              )}
              {events.slice(0, 300).map(ev => {
                const sel = selectedEvent?.event_id === ev.event_id
                const fc  = frpColor(ev.frp)
                return (
                  <div
                    key={ev.event_id ?? `${ev.latitude},${ev.longitude}`}
                    onClick={() => setSelectedEvent(ev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 12px', cursor: 'pointer',
                      background: sel ? 'rgba(0,229,220,0.09)' : 'transparent',
                      borderLeft: `2px solid ${sel ? 'var(--cyan)' : 'transparent'}`,
                      borderBottom: '1px solid var(--b0)',
                      transition: 'background var(--ease)',
                    }}
                    onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: fc, flexShrink: 0, boxShadow: `0 0 5px ${fc}70` }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: sel ? 'var(--cyan)' : 'var(--t2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.event_id ?? '\u2014'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                        {ev.frp != null ? `${ev.frp.toLocaleString()} MW` : (ev.satellite ?? '\u2014')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Inspector ── */}
      <div style={{
        width: 300, minWidth: 300, flexShrink: 0,
        background: 'var(--d3)', borderLeft: '1px solid var(--b1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--b1)',
          background: 'var(--d4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, background: 'var(--cyan)', borderRadius: 2, boxShadow: '0 0 6px var(--cyan)' }}/>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>Fire Details</span>
          </div>
          {selectedEvent && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t4)',
              background: 'var(--d5)', border: '1px solid var(--b2)',
              borderRadius: 4, padding: '1px 7px',
              maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedEvent.event_id}
            </span>
          )}
        </div>
        <EventInspector event={selectedEvent} status={status}/>
      </div>
    </div>
  )
}
