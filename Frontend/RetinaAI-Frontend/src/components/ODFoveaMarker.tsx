import React, { useState } from 'react';

interface Props {
  originalUrl: string;
  overlayUrl: string | null;
}

export function ODFoveaMarker({ originalUrl, overlayUrl }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setShowOriginal(false)}
          style={{
            padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7,
            border: 'none', cursor: 'pointer',
            background: !showOriginal ? 'var(--primary)' : '#edf1f1',
            color: !showOriginal ? '#fff' : '#556264',
          }}
        >
          OD / Fovea Overlay
        </button>
        <button
          onClick={() => setShowOriginal(true)}
          style={{
            padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7,
            border: 'none', cursor: 'pointer',
            background: showOriginal ? 'var(--primary)' : '#edf1f1',
            color: showOriginal ? '#fff' : '#556264',
          }}
        >
          Original
        </button>
      </div>
      {/* Show the pre-composited overlay image - already drawn by backend on the retina image */}
      <div className="retina-frame">
        <img
          src={showOriginal ? originalUrl : (overlayUrl || originalUrl)}
          alt={showOriginal ? 'Original fundus' : 'Optic disc & fovea overlay'}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onError={(e) => { (e.target as HTMLImageElement).src = originalUrl; }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>🟢 Green = Optic Disc</span>
        <span>🟤 Brown = Fovea</span>
        <span>✚ Cross markers = detected centre</span>
      </div>
    </div>
  );
}
