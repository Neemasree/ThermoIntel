import React from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, PieChart, Pie,
} from 'recharts'
import { AlertCircle, RefreshCw, TrendingUp, Flame, Satellite, Sun } from 'lucide-react'
import { useAppContext } from '../App'

const CHART_COLORS = ['#00E5DC', '#F59E0B', '#A78BFA', '#F87171', '#38BDF8', '#34D399', '#F97316', '#DC2626']

const TOOLTIP_STYLE = {
  background: 'rgba(12,12,12,0.97)',
  border: '1px solid #484848',
  borderRadius: 8,
  color: '#F2F2F2',
  fontSize: 13,
  boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
  padding: '10px 14px',
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

// Big stat card — clear value, clear label, human-readable
function StatCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string
  icon?: React.ElementType
}) {
  return (
    <div style={{
      background: 'var(--d4)', border: '1px solid var(--b1)',
      borderRadius: 10, padding: '16px 20px',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '10px 10px 0 0' }}/>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: accent ? 4 : 0 }}>
        {Icon && <Icon size={15} color={accent ?? 'var(--t3)'} strokeWidth={1.8}/>}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ?? 'var(--t1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--t4)' }}>{sub}</div>}
    </div>
  )
}

// Chart wrapper with title
function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--d4)', border: '1px solid var(--b1)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--b1)' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

// Donut legend row
function LegendRow({ name, value, pct, color }: { name: string; value: number; pct: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--b0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}/>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</span>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>{pct}%</span>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const { statistics, events, status, error, refresh } = useAppContext()

  if (status === 'loading') return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 18, height: 18, border: '2.5px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 500 }}>Loading analytics…</span>
    </div>
  )

  if (status === 'error') return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <AlertCircle size={28} color="var(--err)"/>
      <div style={{ fontSize: 16, color: 'var(--err)', fontWeight: 700 }}>Could not load data</div>
      <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>{error}</div>
      <button className="btn btn-cyan" onClick={refresh} style={{ gap: 6, fontSize: 13, padding: '8px 16px' }}>
        <RefreshCw size={14}/> Try Again
      </button>
    </div>
  )

  // ── Chart data from real backend ──
  const satData = statistics?.by_satellite
    ? Object.entries(statistics.by_satellite).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    : []
  const srcData = statistics?.by_source
    ? Object.entries(statistics.by_source).map(([name, count]) => ({ name: name.replace('_NRT', '').replace('VIIRS_', ''), count })).sort((a, b) => b.count - a.count)
    : []
  const dnData = statistics?.by_daynight
    ? Object.entries(statistics.by_daynight).map(([k, v]) => ({ name: k === 'D' ? 'Daytime' : k === 'N' ? 'Nighttime' : k, value: v }))
    : []
  const dnTotal = dnData.reduce((s, d) => s + d.value, 0)

  // Land cover from loaded events
  const wcMap: Record<string, number> = {}
  for (const e of events) {
    const n = e.worldcover_class_name ?? 'Unknown'
    wcMap[n] = (wcMap[n] ?? 0) + 1
  }
  const wcData = Object.entries(wcMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const wcTotal = wcData.reduce((s, [, v]) => s + v, 0)

  const lastSync = statistics?.last_sync_at
    ? new Date(statistics.last_sync_at).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'
    : 'Not available'

  const noData = statistics == null

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--d1)' }}>
      <div style={{ padding: '20px 22px', maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', marginBottom: 4 }}>Analytics</h1>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              Live detection statistics · Last synced: <span style={{ color: 'var(--t2)' }}>{lastSync}</span>
            </p>
          </div>
          <button className="btn btn-cyan" onClick={refresh} style={{ gap: 6, fontSize: 13, padding: '7px 14px' }}>
            <RefreshCw size={13}/> Refresh
          </button>
        </div>

        {/* ── 6 summary stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
          <StatCard
            label="Total Detections"
            value={noData ? '—' : statistics!.total_detections.toLocaleString()}
            sub="All fire events ever recorded"
            accent="var(--amber)"
            icon={Flame}
          />
          <StatCard
            label="Detections Today"
            value={noData ? '—' : statistics!.detections_today.toLocaleString()}
            sub="Fire events in last 24 hours"
            accent="var(--cyan)"
          />
          <StatCard
            label="Last 7 Days"
            value={noData ? '—' : statistics!.detections_last_7d.toLocaleString()}
            sub="Fire events this week"
          />
          <StatCard
            label="Average Fire Power"
            value={noData || statistics!.avg_frp == null ? '—' : `${statistics!.avg_frp.toFixed(1)} MW`}
            sub="Average fire radiative power"
            accent="var(--th-2)"
            icon={TrendingUp}
          />
          <StatCard
            label="Strongest Fire"
            value={noData || statistics!.max_frp == null ? '—' : `${statistics!.max_frp.toLocaleString()} MW`}
            sub="Highest recorded fire intensity"
            accent="var(--th-0)"
            icon={Flame}
          />
          <StatCard
            label="Avg Brightness"
            value={noData || statistics!.avg_brightness == null ? '—' : `${statistics!.avg_brightness.toFixed(1)} K`}
            sub="Average brightness temperature"
            icon={Sun}
          />
        </div>

        {/* ── Bar charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Chart title="Detections by Satellite">
            {satData.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={satData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barSize={28}>
                  <CartesianGrid vertical={false} stroke="var(--b0)"/>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#888', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: '#888', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false}
                    tickFormatter={fmt} width={44}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}/>
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {satData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Chart>

          <Chart title="Detections by Data Source">
            {srcData.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={srcData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barSize={28}>
                  <CartesianGrid vertical={false} stroke="var(--b0)"/>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: '#888', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false}
                    tickFormatter={fmt} width={44}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}/>
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {srcData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Chart>
        </div>

        {/* ── Donut charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>

          {/* Day / Night — horizontal bar if one dominates */}
          <Chart title="Day vs Night Detections">
            {dnData.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>No data available</div>
            ) : (() => {
              const topDnPct = dnTotal > 0 ? Math.max(...dnData.map(d => d.value)) / dnTotal : 0
              if (topDnPct > 0.85) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dnData.map((d, i) => {
                      const pct = dnTotal > 0 ? d.value / dnTotal : 0
                      return (
                        <div key={d.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }}/>
                              <span style={{ fontSize: 13, color: 'var(--t2)' }}>{d.name}</span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
                              {d.value.toLocaleString()} <span style={{ fontSize: 11, color: 'var(--t4)' }}>{(pct*100).toFixed(1)}%</span>
                            </span>
                          </div>
                          <div style={{ height: 6, background: 'var(--d6)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct*100}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 3 }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <PieChart width={120} height={120}>
                    <Pie data={dnData} cx={55} cy={55} innerRadius={36} outerRadius={55}
                      dataKey="value" paddingAngle={4} strokeWidth={0}>
                      {dnData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                    </Pie>
                  </PieChart>
                  <div style={{ width: '100%' }}>
                    {dnData.map((d, i) => (
                      <LegendRow key={i} name={d.name} value={d.value}
                        pct={dnTotal > 0 ? ((d.value / dnTotal) * 100).toFixed(1) : '0'}
                        color={CHART_COLORS[i % CHART_COLORS.length]}/>
                    ))}
                  </div>
                </div>
              )
            })()}
          </Chart>

          {/* Land Cover — horizontal bar if one category dominates (>85%), donut otherwise */}
          <Chart title={`Land Cover (${events.length.toLocaleString()} events)`}>
            {wcData.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>
                No enriched events in current batch
              </div>
            ) : (() => {
              const topPct = wcTotal > 0 ? wcData[0][1] / wcTotal : 0
              // Dominant category (>85%): use horizontal proportion bars instead of a near-solid ring
              if (topPct > 0.85) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 4 }}>
                      One category dominates \u2014 showing proportional breakdown:
                    </div>
                    {wcData.map(([name, value], i) => {
                      const pct = wcTotal > 0 ? value / wcTotal : 0
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }}/>
                              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</span>
                              <span style={{ fontSize: 11, color: 'var(--t4)' }}>{(pct * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div style={{ height: 5, background: 'var(--d6)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${pct * 100}%`,
                              background: CHART_COLORS[i % CHART_COLORS.length],
                              borderRadius: 3,
                              transition: 'width 0.5s ease',
                            }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              // Normal donut when distribution is spread
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <PieChart width={120} height={120}>
                    <Pie data={wcData.map(([name, value]) => ({ name, value }))} cx={55} cy={55}
                      innerRadius={36} outerRadius={55} dataKey="value" paddingAngle={3} strokeWidth={0}>
                      {wcData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                    </Pie>
                  </PieChart>
                  <div style={{ width: '100%' }}>
                    {wcData.map(([name, value], i) => (
                      <LegendRow key={i} name={name} value={value}
                        pct={wcTotal > 0 ? ((value / wcTotal) * 100).toFixed(1) : '0'}
                        color={CHART_COLORS[i % CHART_COLORS.length]}/>
                    ))}
                  </div>
                </div>
              )
            })()}
          </Chart>

          {/* Enrichment */}
          <Chart title="WorldCover Enrichment">
            {events.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>No events loaded</div>
            ) : (() => {
              const enriched = events.filter(e => e.worldcover_version != null).length
              const pending  = events.filter(e => e.worldcover_version == null).length
              const data = [
                { name: 'Enriched', value: enriched, color: '#34D399' },
                { name: 'Pending',  value: pending,  color: '#FBBF24' },
              ]
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <PieChart width={120} height={120}>
                    <Pie data={data} cx={55} cy={55} innerRadius={36} outerRadius={55}
                      dataKey="value" paddingAngle={4} strokeWidth={0}>
                      {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
                    </Pie>
                  </PieChart>
                  <div style={{ width: '100%' }}>
                    {data.map(d => (
                      <LegendRow key={d.name} name={d.name} value={d.value}
                        pct={events.length > 0 ? ((d.value / events.length) * 100).toFixed(1) : '0'}
                        color={d.color}/>
                    ))}
                  </div>
                </div>
              )
            })()}
          </Chart>
        </div>

        {/* ML pending — clear plain-English explanation */}
        <div style={{
          background: 'var(--d4)', border: '1px solid var(--b1)',
          borderLeft: '4px solid var(--violet)',
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--violet)' }}/>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--violet)' }}>
              Advanced Analytics — Coming Soon
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.7, marginBottom: 12 }}>
            These features require the ML pipeline to be connected. Once integrated, you'll see fire persistence scores, anomaly detection, and trend analysis.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {['Fire Trend (30 Days)', 'Persistence Scores', 'Anomaly Detection'].map(label => (
              <div key={label} style={{ padding: '12px 14px', background: 'var(--d5)', border: '1px solid var(--b1)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--t4)' }}>Pending ML pipeline</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
