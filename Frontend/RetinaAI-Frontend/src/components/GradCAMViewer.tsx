import React, { useState } from 'react';

interface Props {
  originalUrl: string;
  gradcamUrl: string | null;
  loading?: boolean;
}

export function GradCAMViewer({ originalUrl, gradcamUrl, loading }: Props) {
  const [tab, setTab] = useState<'original' | 'overlay'>('overlay');

  if (loading) return <div className="retina-frame skeleton" style={{ minHeight: 200 }} />;

  const tabs = [
    { id: 'overlay', label: 'Grad-CAM Overlay' },
    { id: 'original', label: 'Original' },
  ] as const;

  const displayUrl = tab === 'original' ? originalUrl : (gradcamUrl || originalUrl);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7,
              border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--primary)' : '#edf1f1',
              color: tab === t.id ? '#fff' : '#556264',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Show pre-composited overlay image — no absolute positioning needed */}
      <div className="retina-frame">
        <img
          src={displayUrl}
          alt={tab === 'original' ? 'Original fundus' : 'Grad-CAM attention overlay'}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onError={(e) => { (e.target as HTMLImageElement).src = originalUrl; }}
        />
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {tab === 'overlay'
          ? 'Red/warm regions = areas where the model focused most when making its diagnosis.'
          : 'Original captured fundus image before AI processing.'}
      </p>
    </div>
  );
}
