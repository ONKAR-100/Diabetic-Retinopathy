/**
 * Reusable skeleton loaders for fast perceived performance.
 * Uses the existing rqShimmer animation from styles.css.
 *
 * Usage:
 *   <SkeletonStatCards />          — 4 dashboard stat cards
 *   <SkeletonTable rows={10} />    — table rows (history / patients)
 *   <SkeletonList rows={5} />      — card-style list rows
 */

import React from 'react';

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #f0f4f4 25%, #e4eceb 50%, #f0f4f4 75%)',
  backgroundSize: '200% 100%',
  animation: 'rqShimmer 1.8s infinite',
  borderRadius: 6,
};

const bar = (w: string | number, h: number, style?: React.CSSProperties) => (
  <div style={{ ...shimmerStyle, width: w, height: h, ...style }} />
);

/** 4 stat cards matching the dashboard layout */
export function SkeletonStatCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          background: '#fff',
          borderRadius: 12,
          padding: '20px 20px 16px',
          border: '1px solid #edf2f1',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {bar(100, 14)}
            {bar(32, 32, { borderRadius: '50%' })}
          </div>
          {bar(80, 32)}
          {bar(120, 12)}
        </div>
      ))}
    </div>
  );
}

/** Full-width skeleton table for list pages */
export function SkeletonTable({ rows = 8, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #edf2f1',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '12px 20px',
        borderBottom: '1px solid #edf2f1',
        background: '#f8fbfa',
      }}>
        {Array.from({ length: cols }).map((_, j) => (
          <div key={j} style={{ flex: j === 0 ? 2 : 1 }}>
            {bar('70%', 11)}
          </div>
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex',
          gap: 16,
          padding: '14px 20px',
          borderBottom: i < rows - 1 ? '1px solid #edf2f1' : 'none',
          alignItems: 'center',
        }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} style={{ flex: j === 0 ? 2 : 1 }}>
              {j === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {bar(32, 32, { borderRadius: '50%', flexShrink: 0 })}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bar('75%', 13)}
                    {bar('55%', 10)}
                  </div>
                </div>
              ) : (
                bar(`${50 + (j * 13) % 40}%`, 13)
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card-grid skeleton for patients/screenings grid view */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          border: '1px solid #edf2f1',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {bar(44, 44, { borderRadius: '50%', flexShrink: 0 })}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bar('70%', 14)}
              {bar('50%', 11)}
            </div>
          </div>
          {bar('100%', 1, { background: '#edf2f1' })}
          {[0, 1, 2].map(j => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {bar('40%', 11)}
              {bar('30%', 11)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Simple single-line skeleton bar (inline use) */
export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return bar(width, height);
}

/** Dashboard recent screenings table skeleton */
export function SkeletonRecentTable({ rows = 5 }: { rows?: number }) {
  return <SkeletonTable rows={rows} cols={6} />;
}

