import React from 'react';
import { Card, Badge } from '../components';
import { LesionResult } from '../types';
import { BACKEND_URL } from '../services/api';

const BACKEND = BACKEND_URL;
const getUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path;
  const normalized = path.replace(/\\/g, '/');
  const staticIdx = normalized.indexOf('static/');
  if (staticIdx !== -1) return `${BACKEND}/${normalized.slice(staticIdx)}`;
  return `${BACKEND}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
};

export function LesionPanel({ lesion }: { lesion: LesionResult | null }) {
  if (!lesion) {
    return (
      <Card>
        <h3>Lesion Analysis — Coming Soon</h3>
        <p>Detailed lesion segmentation (MA, HE, EX, NV) is currently in development and will be available in a future update.</p>
      </Card>
    );
  }

  const items = [
    { 
      key: 'microaneurysm', 
      label: 'Microaneurysms', 
      colorName: 'Blue', 
      color: '#2563eb', 
      bg: '#eff6ff', 
      border: '#bfdbfe',
      data: lesion.microaneurysm 
    },
    { 
      key: 'exudate', 
      label: 'Exudates', 
      colorName: 'Yellow', 
      color: '#ca8a04', 
      bg: '#fefce8', 
      border: '#fef08a',
      data: lesion.exudate 
    },
    { 
      key: 'hemorrhage', 
      label: 'Hemorrhages', 
      colorName: 'Orange', 
      color: '#ea580c', 
      bg: '#fff7ed', 
      border: '#fed7aa',
      data: lesion.hemorrhage 
    },
    { 
      key: 'neovascularization', 
      label: 'Neovascularization', 
      colorName: 'Clear', 
      color: '#0d9488', 
      bg: '#f0fdfa', 
      border: '#ccfbf1',
      data: lesion.neovascularization 
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {lesion.overlay_url && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <img 
            src={getUrl(lesion.overlay_url)} 
            alt="Lesion Segmentation Overlay" 
            style={{ width: '100%', height: 'auto', display: 'block' }} 
          />
          {/* Color Legend Bar */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 18, 
            padding: '10px 14px', 
            background: '#f8fafc', 
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Disease Colors:
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb' }} />
              Blue = Microaneurysms
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#ea580c' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ea580c' }} />
              Orange = Hemorrhages
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#a16207' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ca8a04' }} />
              Yellow = Exudates
            </span>
          </div>
        </Card>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        {items.map(it => (
          <Card key={it.key} style={{ borderLeft: `4px solid ${it.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span 
                  style={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: '50%', 
                    background: it.color, 
                    display: 'inline-block',
                    flexShrink: 0
                  }} 
                />
                <strong>{it.label}</strong>
              </div>
              <Badge tone={it.data.detected ? 'warn' : 'good'}>
                {it.data.detected ? 'Detected' : 'Clear'}
              </Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid #f0f4f4' }}>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 5, 
                fontSize: 11, 
                fontWeight: 600, 
                color: it.color, 
                background: it.bg, 
                padding: '2px 8px', 
                borderRadius: 6,
                border: `1px solid ${it.border}`
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color }} />
                {it.colorName} on map
              </span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#142426' }}>
                Count: {it.data.count ?? 0}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
