import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { GradCAMViewer } from '../components/GradCAMViewer';
import { VesselOverlay } from '../components/VesselOverlay';
import { ODFoveaMarker } from '../components/ODFoveaMarker';
import { LesionPanel } from '../components/LesionPanel';
import { useScreening } from '../contexts/ScreeningContext';
import { BACKEND_URL } from '../services/api';

const BACKEND = BACKEND_URL;

/**
 * Convert any path stored in the DB to a proper URL.
 * Handles:
 *   - Already full URLs (http/https/blob)
 *   - Relative paths like "static/results/uuid/file.jpg"  → /static/results/...
 *   - Absolute Windows paths like "D:\...\static\results\uuid\file.jpg"
 *     → extract everything from "static/" onwards
 */
const pathToUrl = (path: string | null | undefined, fallback = '/retina.svg'): string => {
  if (!path) return fallback;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path;

  // Normalize backslashes to forward slashes
  const normalized = path.replace(/\\/g, '/');

  // If it contains "static/" anywhere, take from there
  const staticIdx = normalized.indexOf('static/');
  if (staticIdx !== -1) {
    return `${BACKEND}/${normalized.slice(staticIdx)}`;
  }

  // Relative path already
  const clean = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${BACKEND}${clean}`;
};

export default function ExplainPage() {
  const { screening } = useScreening();
  const nav = useNavigate();
  const [activeEye, setActiveEye] = useState<'left' | 'right'>('left');

  const eyeData = activeEye === 'left' ? screening.result?.left_eye : screening.result?.right_eye;
  const currentPreview = activeEye === 'left' ? screening.leftPreviewUrl : screening.rightPreviewUrl;

  // Use the historical original_image_url if available.
  // Fall back to the in-memory preview only if the DB path is missing.
  const originalImg = eyeData?.original_image_url ? pathToUrl(eyeData.original_image_url) : (currentPreview || '/retina.svg');
  const gradcamImg  = pathToUrl(eyeData?.gradcam_url);
  const vesselImg   = pathToUrl(eyeData?.vessel_overlay_url);
  const odfovImg    = pathToUrl(eyeData?.od_fovea_overlay_url);

  return (
    <>
      <SectionHeader
        eyebrow="04 · Model Explainability"
        title="AI Diagnostic Explainability"
        description="Attention heatmaps, segmented vasculature, and anatomical landmark detections for clinical verification."
      />
      <Stepper active={4} />

      <div className="eye-tabs" style={{ margin: '24px 0' }}>
        <button className={activeEye === 'left' ? 'active' : ''} onClick={() => setActiveEye('left')}>Left Eye</button>
        <button className={activeEye === 'right' ? 'active' : ''} onClick={() => setActiveEye('right')}>Right Eye</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <Card>
          <h3>Model Attention Focus (Grad-CAM)</h3>
          <GradCAMViewer originalUrl={originalImg} gradcamUrl={gradcamImg} />
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Retinal Vessel Segmentation</h3>
            {eyeData?.vessel_density != null && (
              <span style={{ fontSize: '0.85rem', background: '#e1f1f0', color: '#0e6264', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                Density: {(eyeData.vessel_density * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <VesselOverlay originalUrl={originalImg} vesselUrl={vesselImg} />
          </div>
        </Card>
        <Card>
          <h3>Optic Disc &amp; Fovea Localization</h3>
          <ODFoveaMarker originalUrl={originalImg} overlayUrl={odfovImg} />
        </Card>
        <Card>
          <h3>Lesion Segmentation Module</h3>
          <LesionPanel lesion={eyeData?.lesion || null} />
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={() => nav('/screening/result')}>← Back to Results</Button>
        <Button onClick={() => nav('/screening/report')}>Proceed to Final Report →</Button>
      </div>
    </>
  );
}
