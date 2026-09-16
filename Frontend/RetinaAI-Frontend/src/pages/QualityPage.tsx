import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button, Progress, Badge } from '../components';
import { useScreening, EyeQualityData } from '../contexts/ScreeningContext';
import { RecaptureAlert } from '../components/RecaptureAlert';
import { CheckCircle2, AlertTriangle, XCircle, Zap } from 'lucide-react';

const METRIC_LABELS: Record<string, string> = {
  focus: 'Sharpness & Focus',
  brightness: 'Illumination / Brightness',
  contrast: 'Contrast Balance',
  fov: 'Field of View (Retina Framing)',
};

const SCORE_THRESHOLDS = {
  good: 70,
  warn: 40,
};

function scoreColor(val: number) {
  if (val >= SCORE_THRESHOLDS.good) return '#2a9d8f';
  if (val >= SCORE_THRESHOLDS.warn) return '#f4a261';
  return '#e63946';
}

function scoreIcon(val: number) {
  if (val >= SCORE_THRESHOLDS.good) return <CheckCircle2 size={14} color="#2a9d8f" />;
  if (val >= SCORE_THRESHOLDS.warn) return <AlertTriangle size={14} color="#f4a261" />;
  return <XCircle size={14} color="#e63946" />;
}

interface EyePanelProps {
  eye: 'left' | 'right';
  data: EyeQualityData;
  previewUrl: string | null;
  defaultPreview: string;
}

function EyePanel({ eye, data, previewUrl, defaultPreview }: EyePanelProps) {
  const { status, reason, recapture_message, scores, enhanced } = data;
  const label = eye === 'left' ? 'Left Eye' : 'Right Eye';

  const statusBg = status === 'ungradable' ? '#fff5f5' : status === 'borderline' ? '#fffbf0' : '#f0fdf8';
  const statusBorder = status === 'ungradable' ? '#e63946' : status === 'borderline' ? '#f4a261' : '#2a9d8f';

  return (
    <div style={{ border: `2px solid ${statusBorder}`, borderRadius: 12, padding: 20, background: statusBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>{label}</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {enhanced && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
              <Zap size={12} /> Enhanced
            </span>
          )}
          <Badge tone={status === 'ungradable' ? 'danger' : status === 'borderline' ? 'warn' : 'good'}>
            {status === 'ungradable' ? 'RECAPTURE NEEDED' : status === 'borderline' ? 'BORDERLINE' : 'ACCEPTED'}
          </Badge>
        </div>
      </div>

      {previewUrl ? (
        <div className="retina-frame" style={{ marginBottom: 12 }}>
          <img src={previewUrl} alt={`${label} fundus`} style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
          <span className="image-tag">{label}</span>
        </div>
      ) : (
        <div className="retina-frame" style={{ marginBottom: 12 }}>
          <img src={defaultPreview} alt="fundus" style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
          <span className="image-tag">{label}</span>
        </div>
      )}

      {status === 'ungradable' && recapture_message && (
        <div style={{ marginBottom: 14 }}>
          <RecaptureAlert reason={reason || 'poor_quality'} message={recapture_message} />
        </div>
      )}

      {enhanced && (
        <div style={{ padding: '8px 12px', background: '#dbeafe', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 12 }}>
          <strong>⚡ Enhancement Applied:</strong> Borderline image was automatically improved (CLAHE + illumination correction) and re-assessed.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(['focus', 'brightness', 'contrast', 'fov'] as const).map(metric => {
          const val = Math.min(100, Math.round(scores[metric] ?? 0));
          return (
            <div key={metric}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {scoreIcon(val)} {METRIC_LABELS[metric]}
                </span>
                <strong style={{ fontSize: 13, color: scoreColor(val) }}>{val}/100</strong>
              </div>
              <Progress label="" value={val} />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, fontSize: 12, color: '#6c757d' }}>
        Overall Score: <strong style={{ color: scoreColor(scores.overall ?? 0) }}>{Math.min(100, Math.round(scores.overall ?? 0))}/100</strong>
      </div>
    </div>
  );
}

export default function QualityPage() {
  const { screening, qualityData } = useScreening();
  const nav = useNavigate();

  // If no real quality data yet, show a waiting state
  if (!qualityData || (!qualityData.left && !qualityData.right)) {
    return (
      <>
        <SectionHeader
          eyebrow="03 · Image Quality"
          title="AI Image Quality Coach"
          description="Assesses focus, exposure, and field of view before classification."
        />
        <Stepper active={3} />
        <Card style={{ marginTop: 24, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>⏳ Awaiting quality assessment…</p>
          <p style={{ color: '#6c757d' }}>Please go back and upload an image to run the quality check.</p>
          <Button variant="secondary" onClick={() => nav('/screening/capture')} style={{ marginTop: 16 }}>
            ← Back to Capture
          </Button>
        </Card>
      </>
    );
  }

  const lq = qualityData.left;
  const rq = qualityData.right;

  // Can continue if at least one eye has acceptable quality
  const canContinue = (lq && lq.status !== 'ungradable') || (rq && rq.status !== 'ungradable');
  const allUngradable = qualityData.all_ungradable;

  return (
    <>
      <SectionHeader
        eyebrow="03 · Image Quality"
        title="AI Image Quality Coach"
        description="Assesses focus, exposure, and field of view before classification to provide instant recapture guidance."
      />
      <Stepper active={3} />

      {allUngradable && (
        <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 10, background: '#fff5f5', border: '1px solid #e63946', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <XCircle size={22} color="#e63946" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: '#e63946' }}>All images require recapture</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6c757d' }}>
              None of the uploaded images meet the minimum quality threshold for reliable AI analysis. Please recapture and re-upload.
            </p>
          </div>
        </div>
      )}

      <div className="two-col" style={{ marginTop: 20, gap: 20 }}>
        {lq && (
          <EyePanel eye="left" data={lq} previewUrl={screening.leftPreviewUrl} defaultPreview="/retina.svg" />
        )}
        {rq && (
          <EyePanel eye="right" data={rq} previewUrl={screening.rightPreviewUrl} defaultPreview="/retina.svg" />
        )}
      </div>

      {qualityData.any_ungradable && !allUngradable && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: '#fffbf0', border: '1px solid #f4a261', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} color="#f4a261" />
          One or more eyes have insufficient quality and will be <strong>excluded from AI analysis</strong>. The remaining eye(s) will be processed normally.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={() => nav('/screening/capture')}>← Recapture Image</Button>
        {canContinue ? (
          <Button onClick={() => nav('/screening/analyze')}>
            Continue to AI Analysis →
          </Button>
        ) : (
          <Button variant="danger" onClick={() => nav('/screening/capture')}>
            Recapture Required
          </Button>
        )}
      </div>
    </>
  );
}
