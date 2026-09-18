import React, { useState } from 'react';
import { AuthenticatedImg } from './AuthenticatedImg';

interface Props {
  originalUrl: string;
  vesselUrl: string | null;
}

export function VesselOverlay({ originalUrl, vesselUrl }: Props) {
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
          Vessel Overlay
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
      {/* Show either the pre-blended vessel overlay OR the raw original */}
      <div className="retina-frame">
        <AuthenticatedImg
          src={showOriginal ? originalUrl : (vesselUrl || originalUrl)}
          fallback={originalUrl}
          alt={showOriginal ? 'Original fundus' : 'Vessel segmentation overlay'}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        Cyan highlights show detected retinal blood vessel network.
      </p>
    </div>
  );
}
