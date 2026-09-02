/**
 * AnalyticsPage — Scientific visualization.
 * Real backend stats only. "Data not available" for missing data.
 * No invented charts.
 */
import React from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area,
} from 'recharts'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useAppContext } from '../App'

/* Chart style constants */
const MONO = "'JetBrains Mono', monospace"
const AXIS_STYLE = { fontSize: 9, fill: '#3A526A', fontFamily: MONO, letterSpacing: 1 }
const TOOLTIP_STYLE = {
  background: 'rgba(8,15,28,0.97)',
  border: '1px solid #2A4057',
  borderRadius: 8,
  color: '#F0F6FF',
  fontSize: 11,
  fontFamily: MONO,
  boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
  padding: '10px 14px',
}
const THERMAL_COLORS = ['#1DE8E3','#F59E0B','#8B5CF6','#F87171','#38BDF8','#22D3A0','#F97316','#DC2626']

/* ── Stat tile ── */
function StatTile({ label, value, accent, sub }: {
  label: string; value: string; accent?: string; sub?: string
}) {
  return (
    <div style={{
      padding: '10px 13px',
      background: 'var(--d4)',
      border: '1px solid var(--b1)',
      borderRadius: 'var(--r-md)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: accent ? `linear-gradient(90deg, ${accent}60, transparent)` : 'transparent',
      }}/>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)', fontFamily: MONO, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 20, fontWeight: 800,
        color: accent ?? 'var(--t1)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 8.5, color: 'var(--t4)', fontFamily: MONO, marginTop: 4, letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  )
}

/* ── Chart card ── */
function ChartCard({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--d4)', border: '1px solid var(--b1)',
      borderRadius: 'var(--r-md)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--b1)',
        background: 'var(--d5)',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--t3)', fontFamily: MONO }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 8.5, color: 'var(--t4)', marginTop: 2, fontFamily: MONO }}>{sub}</div>}
      </div>
      <div style={{ padding: '14px' }}>{children}</div>
    </div>
  )
}

/* ── Unavailable block ── */
function Unavailable({ reason }: { reason: string }) {
  return (
    <div style={{
      padding: '20px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center',
    }}>
      <AlertCircle size={16} color="var(--t4)"/>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', color: 'var(--t4)', fontFamily: MONO }}>
        DATA NOT AVAILABLE
      </div>
      <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6, maxWidth: 220, fontFamily: 'var(--font-sans)' }}>
        {reason}
      </div>
    </div>
  )
}

/* ── Donut legend item ── */
function DonutItem({ name, value, color, total }: {
  name: string; value: number; color: string; total: number
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0', borderBottom: '1px solid var(--b0)', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }}/>
        <span style={{ fontSize: 9.5, color: 'var(--t2)', fontFamily: 'var(--font-sans)' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--t1)', fontWeight: 600 }}>{value.toLocaleString()}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--t4)' }}>{pct}%</span>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const { statistics, events, status, error, refresh } = useAppContext()

  if (status === 'loading') return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--t3)' }}>
      <div style={{ width: 14, height: 14, border: '1.5px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em' }}>LOADING ANALYTICS</span>
    </div>
  )

  if (status === 'error') return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <AlertCircle size={20} color="var(--err)"/>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--err)', fontWeight: 700 }}>DATA CONNECTION LOST</div>
      <div style={{ fontSize: 10, color: 'var(--t4)', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>{error}</div>
      <button className="btn btn-cyan" onClick={refresh} style={{ gap: 5 }}>
        <RefreshCw size={10}/> RETRY
      </button>
    </div>
  )

  /* Build chart data from real backend stats */
  const satData = statistics?.by_satellite
    ? Object.entries(statistics.by_satellite).map(([n, v]) => ({ name: n, count: v })).sort((a, b) => b.count - a.count)
    : []
  const srcData = statistics?.by_source
    ? Object.entries(statistics.by_source).map(([n, v]) => ({ name: n, count: v })).sort((a, b) => b.count - a.count)
    : []
  const dnData = statistics?.by_daynight
    ? Object.entries(statistics.by_daynight).map(([k, v]) => ({
        name: k === 'D' ? 'Day' : k === 'N' ? 'Night' : k, value: v,
      }))
    : []
  const dnTotal = dnData.reduce((s, d) => s + d.value, 0)

  /* WorldCover distribution from loaded events */
  const wcMap: Record<string, number> = {}
  for (const e of events) {
    const n = e.worldcover_class_name ?? 'Pending / Unknown'
    wcMap[n] = (wcMap[n] ?? 0) + 1
  }
  const wcData = Object.entries(wcMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
  const wcTotal = wcData.reduce((s, d) => s + d.value, 0)

  /* Enrichment breakdown from loaded events */
  const enriched = events.filter(e => e.worldcover_version != null).length
  const pending  = events.filter(e => e.worldcover_version == null).length
  const enrichData = [
    { name: 'Enriched', value: enriched, color: 'var(--ok)'   },
    { name: 'Pending',  value: pending,  color: 'var(--warn)' },
  ]

  const lastSync = statistics?.last_sync_at
    ? new Date(statistics.last_sync_at).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'
    : null

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--d1)' }}>
      <div style={{ padding: '14px 16px', maxWidth: 1200 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{ width: 2, height: 14, background: 'var(--violet)', borderRadius: 1, boxShadow: '0 0 4px var(--violet)' }}/>
              <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
                Analytics
              </h1>
            </div>
            <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: MONO, letterSpacing: '0.06em' }}>
              DETECTION STATISTICS ·{' '}
              {lastSync ? `LAST SYNC ${lastSync}` : 'SYNC TIME UNAVAILABLE'}
            </div>
          </div>
          <button className="btn btn-cyan" onClick={refresh} style={{ gap: 5, fontSize: 9, fontFamily: MONO, letterSpacing: '0.08em' }}>
            <RefreshCw size={10}/> REFRESH
          </button>
        </div>

        {/* ── Summary tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
          <StatTile
            label="Total Detections"
            value={statistics?.total_detections != null ? statistics.total_detections.toLocaleString() : '—'}
            accent="var(--amber)" sub="all time"/>
          <StatTile
            label="Today"
            value={statistics?.detections_today != null ? statistics.detections_today.toLocaleString() : '—'}
            sub="24-hour window"/>
          <StatTile
            label="Last 7 Days"
            value={statistics?.detections_last_7d != null ? statistics.detections_last_7d.toLocaleString() : '—'}
            sub="7-day window"/>
          <StatTile
            label="Avg FRP"
            value={statistics?.avg_frp != null ? `${statistics.avg_frp.toFixed(1)} MW` : '—'}
            accent="var(--th-1)" sub="radiated power"/>
          <StatTile
            label="Peak FRP"
            value={statistics?.max_frp != null ? `${statistics.max_frp.toLocaleString()} MW` : '—'}
            accent="var(--th-x)" sub="all-time max"/>
          <StatTile
            label="Avg Brightness"
            value={statistics?.avg_brightness != null ? `${statistics.avg_brightness.toFixed(1)} K` : '—'}
            sub="brightness temp"/>
        </div>

        {/* ── Charts row 1 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>

          <ChartCard title="Detections by Satellite" sub="Platform contribution · backend statistics">
            {satData.length === 0 ? <Unavailable reason="No satellite breakdown available from backend."/> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={satData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barSize={18}>
                  <CartesianGrid vertical={false} stroke="rgba(26,43,60,0.8)"/>
                  <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false}/>
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} width={36}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}
                    cursor={{ fill: 'rgba(29,232,227,0.05)' }}/>
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {satData.map((_, i) => <Cell key={i} fill={THERMAL_COLORS[i % THERMAL_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Detections by FIRMS Source" sub="Data source distribution">
            {srcData.length === 0 ? <Unavailable reason="No FIRMS source breakdown available."/> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={srcData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barSize={18}>
                  <CartesianGrid vertical={false} stroke="rgba(26,43,60,0.8)"/>
                  <XAxis dataKey="name" tick={{ ...AXIS_STYLE, fontSize: 8 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} width={36}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}
                    cursor={{ fill: 'rgba(29,232,227,0.05)' }}/>
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {srcData.map((_, i) => <Cell key={i} fill={THERMAL_COLORS[(i + 3) % THERMAL_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── Charts row 2 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>

          {/* Day / Night donut */}
          <ChartCard title="Day / Night Split" sub="Acquisition time distribution">
            {dnData.length === 0 ? <Unavailable reason="Day/Night breakdown unavailable."/> : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <PieChart width={110} height={110}>
                  <Pie data={dnData} cx={50} cy={50} innerRadius={32} outerRadius={50}
                    dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {dnData.map((_, i) => <Cell key={i} fill={THERMAL_COLORS[i % THERMAL_COLORS.length]}/>)}
                  </Pie>
                </PieChart>
                <div style={{ width: '100%' }}>
                  {dnData.map((d, i) => (
                    <DonutItem key={i} name={d.name} value={d.value}
                      color={THERMAL_COLORS[i % THERMAL_COLORS.length]} total={dnTotal}/>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          {/* Land cover donut */}
          <ChartCard title="Land Cover Distribution" sub={`${events.length.toLocaleString()} loaded events`}>
            {wcData.length === 0 ? <Unavailable reason="No enriched events in batch. WorldCover enrichment may be pending."/> : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <PieChart width={110} height={110}>
                  <Pie data={wcData} cx={50} cy={50} innerRadius={32} outerRadius={50}
                    dataKey="value" paddingAngle={2} strokeWidth={0}>
                    {wcData.map((_, i) => <Cell key={i} fill={THERMAL_COLORS[i % THERMAL_COLORS.length]}/>)}
                  </Pie>
                </PieChart>
                <div style={{ width: '100%' }}>
                  {wcData.map((d, i) => (
                    <DonutItem key={i} name={d.name} value={d.value}
                      color={THERMAL_COLORS[i % THERMAL_COLORS.length]} total={wcTotal}/>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          {/* Enrichment status */}
          <ChartCard title="Enrichment Status" sub="WorldCover · loaded batch">
            {events.length === 0 ? <Unavailable reason="No events loaded."/> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <PieChart width={110} height={110} style={{ margin: '0 auto' }}>
                  <Pie data={enrichData} cx={50} cy={50} innerRadius={32} outerRadius={50}
                    dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {enrichData.map((d, i) => <Cell key={i} fill={d.color}/>)}
                  </Pie>
                </PieChart>
                {enrichData.map(d => (
                  <DonutItem key={d.name} name={d.name} value={d.value} color={d.color} total={events.length}/>
                ))}
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── ML pending analytics ── */}
        <div style={{
          background: 'var(--d4)', border: '1px solid var(--b1)',
          borderTop: '2px solid var(--violet)',
          borderRadius: 'var(--r-md)', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--violet)' }}/>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--violet)', fontFamily: MONO }}>
              ADVANCED ANALYTICS — REQUIRES ML PIPELINE
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'FRP Trend (30D)',       reason: 'Requires time-series aggregation endpoint.' },
              { label: 'Persistence Scores',    reason: 'Requires ML pipeline integration.' },
              { label: 'Anomaly Distribution',  reason: 'Requires ML anomaly scoring.' },
            ].map(({ label, reason }) => (
              <div key={label} style={{
                padding: '10px 12px', background: 'var(--d5)',
                border: '1px solid var(--b1)', borderRadius: 'var(--r-sm)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: 'var(--t3)', fontFamily: MONO, marginBottom: 5 }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: 'var(--violet)', fontFamily: MONO, letterSpacing: '0.08em', marginBottom: 3 }}>
                  PENDING ML PIPELINE
                </div>
                <div style={{ fontSize: 9, color: 'var(--t4)', lineHeight: 1.5 }}>{reason}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
