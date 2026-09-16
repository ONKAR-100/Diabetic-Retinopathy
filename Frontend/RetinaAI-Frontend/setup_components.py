import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# --- COMPONENTS ---

write_file("src/components/ProtectedRoute.tsx", """
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children, requireDoctor = false }: 
  { children: React.ReactNode; requireDoctor?: boolean }) {
  const { isAuthenticated, isDoctor } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireDoctor && !isDoctor) return <Navigate to="/" replace />;
  return <>{children}</>;
}
""")

write_file("src/components/ImageUploader.tsx", """
import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

export function ImageUploader({ eye, onFile, preview }: { eye: string, onFile: (file: File, previewUrl: string) => void, preview?: string | null }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFile(file, url);
  };

  return (
    <div 
      className={`retina-frame ${isDragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => document.getElementById(`upload-${eye}`)?.click()}
      style={{ cursor: 'pointer', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <input 
        id={`upload-${eye}`} 
        type="file" 
        accept="image/jpeg,image/png,image/bmp,image/tiff" 
        style={{ display: 'none' }} 
        onChange={e => { if (e.target.files) handleFile(e.target.files[0]); }} 
      />
      {preview ? (
        <img src={preview} alt={`${eye} preview`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Upload size={32} style={{ marginBottom: 8 }} />
          <p>Drag & drop or click to upload<br/>{eye}</p>
        </div>
      )}
      <span className="image-tag">{eye}</span>
    </div>
  );
}
""")

write_file("src/components/GradCAMViewer.tsx", """
import React, { useState } from 'react';

export function GradCAMViewer({ originalUrl, gradcamUrl, loading }: { originalUrl: string, gradcamUrl: string | null, loading?: boolean }) {
  const [tab, setTab] = useState<'original'|'gradcam'|'overlay'>('overlay');
  const [opacity, setOpacity] = useState(0.5);

  if (loading) return <div className="retina-frame skeleton" />;

  return (
    <div>
      <div className="eye-tabs" style={{ marginBottom: 12 }}>
        <button className={tab==='original'?'active':''} onClick={()=>setTab('original')}>Original</button>
        <button className={tab==='gradcam'?'active':''} onClick={()=>setTab('gradcam')}>Heatmap</button>
        <button className={tab==='overlay'?'active':''} onClick={()=>setTab('overlay')}>Overlay</button>
      </div>
      <div className="retina-frame">
        <img src={originalUrl} alt="Original" style={{ display: tab==='gradcam' ? 'none' : 'block' }} />
        {gradcamUrl && <img src={gradcamUrl} alt="Grad-CAM" style={{ position: 'absolute', top: 0, left: 0, opacity: tab==='overlay' ? opacity : (tab==='gradcam'?1:0), mixBlendMode: 'multiply' }} />}
      </div>
      {tab === 'overlay' && (
        <div style={{ marginTop: 12 }}>
          <label>Overlay Opacity</label>
          <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={e=>setOpacity(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>Grad-CAM shows where the model focused, not exact lesion boundaries.</p>
    </div>
  );
}
""")

write_file("src/components/VesselOverlay.tsx", """
import React, { useState } from 'react';

export function VesselOverlay({ originalUrl, vesselUrl }: { originalUrl: string, vesselUrl: string | null }) {
  return (
    <div className="retina-frame">
      <img src={originalUrl} alt="Original" />
      {vesselUrl && <img src={vesselUrl} alt="Vessel Overlay" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.8 }} />}
    </div>
  );
}
""")

write_file("src/components/ODFoveaMarker.tsx", """
import React from 'react';

export function ODFoveaMarker({ originalUrl, overlayUrl }: { originalUrl: string, overlayUrl: string | null }) {
  return (
    <div className="retina-frame">
      <img src={originalUrl} alt="Original" />
      {overlayUrl && <img src={overlayUrl} alt="OD/Fovea Marker" style={{ position: 'absolute', top: 0, left: 0 }} />}
    </div>
  );
}
""")

write_file("src/components/LesionPanel.tsx", """
import React from 'react';
import { Card, Badge } from '../components';
import { LesionResult } from '../types';

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
    { key: 'microaneurysm', label: 'Microaneurysms', data: lesion.microaneurysm },
    { key: 'exudate', label: 'Exudates', data: lesion.exudate },
    { key: 'hemorrhage', label: 'Hemorrhages', data: lesion.hemorrhage },
    { key: 'neovascularization', label: 'Neovascularization', data: lesion.neovascularization }
  ];

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
      {items.map(it => (
        <Card key={it.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{it.label}</strong>
            <Badge tone={it.data.detected ? 'warn' : 'good'}>{it.data.detected ? 'Detected' : 'Clear'}</Badge>
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Confidence: {(it.data.confidence * 100).toFixed(1)}%
            {it.data.count !== undefined && ` | Count: ${it.data.count}`}
          </div>
        </Card>
      ))}
    </div>
  );
}
""")

write_file("src/components/RecaptureAlert.tsx", """
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../components';

export function RecaptureAlert({ reason, message }: { reason: string, message: string }) {
  const titles: Record<string, string> = {
    too_dark: "Image Too Dark",
    overexposed_glare: "Overexposed / Flash Glare",
    blurry_recapture_recommended: "Out of Focus",
    poor_framing_or_no_retina_detected: "Poor Framing",
    unreadable_file: "Invalid Image"
  };

  const msgs: Record<string, string> = {
    too_dark: "Increase illumination and ensure the camera flash is working.",
    overexposed_glare: "Reduce brightness or adjust angle to avoid glare.",
    blurry_recapture_recommended: "Clean the lens and stabilize the device.",
    poor_framing_or_no_retina_detected: "Center the optic disc and ensure the retina is visible.",
    unreadable_file: "Please upload a valid JPEG or PNG fundus image."
  };

  return (
    <Card className="danger" style={{ borderLeft: '4px solid var(--danger)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <AlertTriangle color="var(--danger)" />
        <h3 style={{ margin: 0 }}>Image Ungradable — Recapture Required</h3>
      </div>
      <div style={{ marginLeft: 36 }}>
        <strong>{titles[reason] || reason}</strong>
        <p style={{ marginTop: 4 }}>{message || msgs[reason] || "Please retake the image."}</p>
      </div>
    </Card>
  );
}
""")

write_file("src/components/AnalysisPipeline.tsx", """
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card } from '../components';

export function AnalysisPipeline({ onComplete }: { onComplete: () => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    "Image Quality Assessment",
    "Enhancement",
    "DR Classification",
    "Grad-CAM Generation",
    "Vessel Extraction & Landmarks",
    "Report Generation"
  ];

  useEffect(() => {
    let current = 0;
    const int = setInterval(() => {
      current++;
      setActiveStep(current);
      if (current >= steps.length) {
        clearInterval(int);
        setTimeout(onComplete, 500);
      }
    }, 800);
    return () => clearInterval(int);
  }, [onComplete]);

  return (
    <Card>
      <h3>Analysis Pipeline</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: i <= activeStep ? 1 : 0.5 }}>
            {i < activeStep ? <CheckCircle2 color="var(--good)" /> : i === activeStep ? <Loader2 className="animate-spin" /> : <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)' }} />}
            <span style={{ fontWeight: i === activeStep ? 600 : 400 }}>{s}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
""")

write_file("src/components/ReviewQueueTable.tsx", """
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '../components';
import { ScreeningResult } from '../types';

export function ReviewQueueTable({ screenings }: { screenings: ScreeningResult[] }) {
  const nav = useNavigate();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: 12 }}>Patient</th>
            <th style={{ padding: 12 }}>Date</th>
            <th style={{ padding: 12 }}>Grade (L/R)</th>
            <th style={{ padding: 12 }}>Priority</th>
            <th style={{ padding: 12 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {screenings.map(s => {
            const maxGrade = Math.max(s.left_eye?.dr_grade || 0, s.right_eye?.dr_grade || 0);
            return (
              <tr key={s.screening_id} style={{ borderBottom: '1px solid var(--border)' }} onClick={() => nav(`/screening/result?id=${s.screening_id}`)}>
                <td style={{ padding: 12 }}>{s.patient_name}</td>
                <td style={{ padding: 12 }}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td style={{ padding: 12 }}>{s.left_eye?.dr_grade} / {s.right_eye?.dr_grade}</td>
                <td style={{ padding: 12 }}>
                  {maxGrade >= 3 ? <Badge tone="danger">URGENT</Badge> : maxGrade === 2 ? <Badge tone="warn">PRIORITY</Badge> : <Badge tone="good">ROUTINE</Badge>}
                </td>
                <td style={{ padding: 12 }}><Button variant="ghost" onClick={() => nav(`/screening/result?id=${s.screening_id}`)}>Review</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
""")
