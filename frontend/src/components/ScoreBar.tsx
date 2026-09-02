import React from 'react'

interface Props {
  score: number
  color?: string
  height?: number
  showLabel?: boolean
}

export default function ScoreBar({ score, color, height = 4, showLabel = false }: Props) {
  const clampedScore = Math.min(100, Math.max(0, score))
  const barColor = color ?? (
    clampedScore >= 90 ? 'var(--risk-extreme)' :
    clampedScore >= 75 ? 'var(--risk-critical)' :
    clampedScore >= 60 ? 'var(--risk-high)' :
    clampedScore >= 40 ? 'var(--risk-medium)' :
    'var(--risk-low)'
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1,
        height,
        background: 'var(--bg-panel-3)',
        borderRadius: height,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clampedScore}%`,
          height: '100%',
          background: barColor,
          borderRadius: height,
          transition: 'width var(--transition-slow)',
        }} />
      </div>
      {showLabel && (
        <span style={{
          fontSize: 'var(--text-xs)',
          color: barColor,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 28,
          textAlign: 'right',
        }}>
          {clampedScore}
        </span>
      )}
    </div>
  )
}
