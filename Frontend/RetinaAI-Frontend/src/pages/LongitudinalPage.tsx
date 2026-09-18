import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info, Eye, Activity, Layers } from 'lucide-react';
import { getComparison, triggerComparison } from '../services/screenings';
import { LongitudinalComparison, ProgressionStatus } from '../types';

const API_BASE = 'http://127.0.0.1:8000';

const GRADE_NAMES: Record<number, string> = {
  0: 'No DR',
  1: 'Mild NPDR',
  2: 'Moderate NPDR',
  3: 'Severe NPDR',
  4: 'Proliferative DR',
};

const GRADE_COLORS: Record<number, string> = {
  0: '#059669',
  1: '#d97706',
  2: '#dc2626',
  3: '#9b1c1c',
  4: '#581c87',
};

const GRADE_BG: Record<number, string> = {
  0: '#d1fae5',
  1: '#fef3c7',
  2: '#fee2e2',
  3: '#fde8e8',
  4: '#f3e8ff',
};

function progressionConfig(status: ProgressionStatus) {
  switch (status) {
    case 'baseline':
      return { label: 'BASELINE ESTABLISHED', color: '#0369a1', bg: '#e0f2fe', icon: <Info size={16} />, tone: 'info' };
    case 'stable':
      return { label: 'AI: NO SIGNIFICANT CHANGE', color: '#059669', bg: '#d1fae5', icon: <CheckCircle2 size={16} />, tone: 'good' };
    case 'possible_improvement':
      return { label: 'AI: POSSIBLE IMPROVEMENT', color: '#0369a1', bg: '#e0f2fe', icon: <TrendingDown size={16} />, tone: 'info' };
    case 'possible_worsening':
      return { label: 'AI: POSSIBLE WORSENING', color: '#dc2626', bg: '#fee2e2', icon: <TrendingUp size={16} />, tone: 'danger' };
    case 'indeterminate':
    default:
      return { label: 'INDETERMINATE', color: '#92400e', bg: '#fef3c7', icon: <AlertTriangle size={16} />, tone: 'warn' };
  }
}

function GradeArrow({ prev, curr }: { prev: number | null; curr: number | null }) {
  if (prev === null || curr === null) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
  const delta = curr - prev;
  if (delta > 0) return <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 700 }}>▲ +{delta}</span>;
  if (delta < 0) return <span style={{ color: '#059669', fontSize: 13, fontWeight: 700 }}>▼ {delta}</span>;
  return <span style={{ color: '#6b7280', fontSize: 13, fontWeight: 700 }}>→ 0</span>;
}

function GradeChip({ grade, label }: { grade: number | null; label: string }) {
  if (grade === null) return (
    <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>Not graded</div>
    </div>
  );
  return (
    <div style={{ background: GRADE_BG[grade] || '#f1f5f9', border: `1px solid ${GRADE_COLORS[grade] || '#e2e8f0'}30`, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: GRADE_COLORS[grade] || '#374151', marginTop: 2 }}>
        G{grade} · {GRADE_NAMES[grade] || `Grade ${grade}`}
      </div>
    </div>
  );
}

function ProbBar({ label, prev, curr }: { label: string; prev: number | null; curr: number | null }) {
  const p = prev ?? 0;
  const c = curr ?? 0;
  const maxVal = Math.max(p, c, 1);
  const gradeIdx = parseInt(label.replace('G', '')) || 0;
  const color = GRADE_COLORS[gradeIdx] || '#0e6264';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label} ({GRADE_NAMES[gradeIdx] || ''})</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {p.toFixed(1)}% → <strong style={{ color: Math.abs(c - p) >= 10 ? (c > p ? '#dc2626' : '#059669') : '#374151' }}>{c.toFixed(1)}%</strong>
        </span>
      </div>
      <div style={{ position: 'relative', height: 8, background: '#e5e7eb', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(p / maxVal) * 100}%`, background: '#cbd5e1', borderRadius: 4 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(c / maxVal) * 100}%`, background: color, borderRadius: 4, opacity: 0.8 }} />
      </div>
    </div>
  );
}

function ImageComparePanel({ prevUrl, currUrl, prevLabel, currLabel, title }: {
  prevUrl?: string | null; currUrl?: string | null; prevLabel: string; currLabel: string; title: string;
}) {
  if (!prevUrl && !currUrl) return null;
  const imgBase = (url: string) => url.startsWith('/') ? `${API_BASE}${url}` : url;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {prevUrl ? (
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{prevLabel}</div>
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0d1e20', border: '1px solid #1f2e30' }}>
              <img src={imgBase(prevUrl)} alt="Previous" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 10, background: '#f1f5f9', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>No previous image</span>
          </div>
        )}
        {currUrl ? (
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{currLabel}</div>
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0d1e20', border: '1px solid #1f2e30' }}>
              <img src={imgBase(currUrl)} alt="Current" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 10, background: '#f1f5f9', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>No current image</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EyeComparisonSection({
  eye, label, comp, prevScr, currScr,
}: {
  eye: 'left' | 'right';
  label: string;
  comp: LongitudinalComparison;
  prevScr?: any;
  currScr?: any;
}) {
  const gradePrev = eye === 'left' ? comp.left_grade_prev : comp.right_grade_prev;
  const gradeCurr = eye === 'left' ? comp.left_grade_curr : comp.right_grade_curr;
  const probPrev = eye === 'left' ? comp.left_prob_prev : comp.right_prob_prev;
  const probCurr = eye === 'left' ? comp.left_prob_curr : comp.right_prob_curr;
  const regStatus = eye === 'left' ? comp.left_registration_status : comp.right_registration_status;
  const regQuality = eye === 'left' ? comp.left_registration_quality : comp.right_registration_quality;
  const diffUrl = eye === 'left' ? comp.left_diff_overlay_url : comp.right_diff_overlay_url;
  const vdPrev = eye === 'left' ? comp.left_vessel_density_prev : comp.right_vessel_density_prev;
  const vdCurr = eye === 'left' ? comp.left_vessel_density_curr : comp.right_vessel_density_curr;
  const avrPrev = eye === 'left' ? comp.left_avr_prev : comp.right_avr_prev;
  const avrCurr = eye === 'left' ? comp.left_avr_curr : comp.right_avr_curr;
  const tortPrev = eye === 'left' ? comp.left_tortuosity_prev : comp.right_tortuosity_prev;
  const tortCurr = eye === 'left' ? comp.left_tortuosity_curr : comp.right_tortuosity_curr;
  const dfPrev = eye === 'left' ? comp.left_fractal_dim_prev : comp.right_fractal_dim_prev;
  const dfCurr = eye === 'left' ? comp.left_fractal_dim_curr : comp.right_fractal_dim_curr;

  const prevImgUrl = prevScr?.[`${eye}_image_path`] || null;
  const currImgUrl = currScr?.[`${eye}_image_path`] || null;
  const prevGradcam = prevScr?.[`${eye}_gradcam_path`] || null;
  const currGradcam = currScr?.[`${eye}_gradcam_path`] || null;

  const regLabel = regStatus === 'success' ? `Aligned · ${((regQuality || 0) * 100).toFixed(0)}% quality`
    : regStatus === 'failed' ? 'Registration failed — comparison indeterminate'
    : regStatus === 'skipped' ? 'Skipped (ungradable image)'
    : regStatus === 'no_prev_image' ? 'No previous image available'
    : '—';

  const regColor = regStatus === 'success' ? '#059669' : regStatus === 'failed' ? '#dc2626' : '#92400e';

  const hasBiomarkers = vdPrev != null || vdCurr != null || avrPrev != null || avrCurr != null || tortPrev != null || tortCurr != null || dfPrev != null || dfCurr != null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Eye size={16} color="#0e6264" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#132b2e' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: regColor, fontWeight: 600 }}>{regLabel}</span>
      </div>

      {/* Grade Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <GradeChip grade={gradePrev} label="Previous Exam" />
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <GradeArrow prev={gradePrev} curr={gradeCurr} />
        </div>
        <GradeChip grade={gradeCurr} label="Current Exam" />
      </div>

      {/* Probability Distribution */}
      {probPrev && probCurr && (
        <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5b7679', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Grade Probability Shift (Previous → Current)
          </div>
          {['G0','G1','G2','G3','G4'].map((g, i) => (
            <ProbBar key={g} label={g} prev={probPrev[i] ?? null} curr={probCurr[i] ?? null} />
          ))}
        </div>
      )}

      {/* Image Comparisons */}
      <ImageComparePanel
        prevUrl={prevImgUrl}
        currUrl={currImgUrl}
        prevLabel="Previous Fundus"
        currLabel="Current Fundus"
        title="Fundus Image Comparison"
      />
      <ImageComparePanel
        prevUrl={prevGradcam}
        currUrl={currGradcam}
        prevLabel="Previous GradCAM"
        currLabel="Current GradCAM"
        title="Model Attention (GradCAM) — region that influenced AI classification"
      />

      {/* Diff overlay */}
      {regStatus === 'success' && diffUrl && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Registered Difference Overlay
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
            Colour intensity indicates regions of change between aligned images. Blue = low change; Red/yellow = higher change. Not a clinical lesion map.
          </div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #1f2e30', background: '#0d1e20' }}>
            <img src={`${API_BASE}${diffUrl}`} alt="Difference overlay" style={{ width: '100%', display: 'block' }} />
          </div>
        </div>
      )}

      {/* Structural & Microvascular Biomarkers */}
      {hasBiomarkers && (
        <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14, border: '1px solid #edf2f1' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5b7679', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Structural &amp; Retinal Microvascular Biomarkers
          </div>

          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Biomarker</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Previous</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Current</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Change (Δ)</th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1: Vessel Density */}
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#132b2e' }}>Vessel Density</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {vdPrev != null ? vdPrev.toFixed(3) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {vdCurr != null ? vdCurr.toFixed(3) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                    {vdPrev != null && vdCurr != null ? (
                      <span style={{ fontWeight: 600, color: (vdCurr - vdPrev) < -0.05 ? '#dc2626' : '#374151' }}>
                        {vdCurr - vdPrev > 0 ? '+' : ''}{(vdCurr - vdPrev).toFixed(3)}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>

                {/* Row 2: AVR */}
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#132b2e' }}>Arteriolar-to-Venular Ratio (AVR)</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {avrPrev != null ? avrPrev.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {avrCurr != null ? avrCurr.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                    {avrPrev != null && avrCurr != null ? (
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {avrCurr - avrPrev > 0 ? '+' : ''}{(avrCurr - avrPrev).toFixed(4)}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>

                {/* Row 3: Tortuosity */}
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#132b2e' }}>Mean Distance Tortuosity (τ<sub>d</sub>)</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {tortPrev != null ? tortPrev.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {tortCurr != null ? tortCurr.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                    {tortPrev != null && tortCurr != null ? (
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {tortCurr - tortPrev > 0 ? '+' : ''}{(tortCurr - tortPrev).toFixed(4)}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>

                {/* Row 4: Fractal Dimension */}
                <tr>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#132b2e' }}>Fractal Dimension (D<sub>f</sub>)</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {dfPrev != null ? dfPrev.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: '#374151' }}>
                    {dfCurr != null ? dfCurr.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                    {dfPrev != null && dfCurr != null ? (
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {dfCurr - dfPrev > 0 ? '+' : ''}{(dfCurr - dfPrev).toFixed(4)}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 8, fontStyle: 'italic', lineHeight: 1.35 }}>
            * Retinal microvascular biomarkers (AVR, tortuosity, fractal dimension) are computational metrics. Changes reflect algorithmic morphometry across image pairs and do not constitute standalone clinical determinations.
          </div>
        </div>
      )}
    </div>
  );
}

export default function LongitudinalPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [comp, setComp] = useState<LongitudinalComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrigger, setRetrigger] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getComparison(id)
      .then(res => {
        if (res.exists && res.comparison) {
          setComp(res.comparison);
        } else {
          // Auto-trigger if no comparison yet
          return triggerComparison(id).then(c => setComp(c));
        }
      })
      .catch(err => setError(err?.response?.data?.detail || 'Failed to load comparison'))
      .finally(() => setLoading(false));
  }, [id, retrigger]);

  const handleRetrigger = () => {
    setLoading(true);
    setError(null);
    triggerComparison(id!)
      .then(c => setComp(c))
      .catch(err => setError(err?.response?.data?.detail || 'Failed to run comparison'))
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: '#688285' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#183639', marginBottom: 8 }}>
          Running Longitudinal Analysis…
        </div>
        <div style={{ fontSize: 13, color: '#788a8c' }}>
          Aligning images and comparing retinal biomarkers between examinations.
        </div>
      </div>
    );
  }

  if (error || !comp) {
    return (
      <div style={{ padding: '60px 32px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <AlertTriangle size={40} color="#d97706" style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#183639', marginBottom: 8 }}>
          {error || 'Comparison not available'}
        </div>
        <p style={{ color: '#688285', fontSize: 13 }}>
          The longitudinal comparison could not be loaded. This may occur if the screening has not yet been fully analysed.
        </p>
        <button
          onClick={() => nav(-1)}
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0e6264', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          <ArrowLeft size={15} /> Go Back
        </button>
      </div>
    );
  }

  const progConf = progressionConfig(comp.progression_status);
  const prevDateStr = comp.previous_screening_date
    ? new Date(comp.previous_screening_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const currDateStr = comp.current_screening_date
    ? new Date(comp.current_screening_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Current Exam';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => nav(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#0e6264', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}
        >
          <ArrowLeft size={16} /> Back to Patient Profile
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: '#132b2e', margin: 0 }}>
              Longitudinal Retinal Progression Analysis
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#688285' }}>
              {prevDateStr ? `${prevDateStr} vs. ${currDateStr}` : `Baseline Examination · ${currDateStr}`}
              {comp.previous_screening_display_id && ` · Comparing ${comp.previous_screening_display_id} → ${comp.current_screening_display_id}`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {comp.patient_id && (
              <button
                onClick={() => nav(`/patients/${comp.patient_id}/history`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#f4fbf9', border: '1px solid #c3dedd', color: '#0e6264',
                  borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
                }}
              >
                <Activity size={14} /> Full DR History &amp; Graph
              </button>
            )}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: progConf.bg, color: progConf.color,
              border: `1px solid ${progConf.color}30`,
              borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 12
            }}>
              {progConf.icon} {progConf.label}
            </div>
            <button
              onClick={handleRetrigger}
              disabled={loading}
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
            >
              ↺ Re-run Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Safety banner */}
      <div style={{ display: 'flex', gap: 10, background: '#fef9c3', border: '1px solid #fde047', borderRadius: 12, padding: '12px 16px', marginBottom: 20, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} color="#854d0e" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#713f12', lineHeight: 1.5 }}>
          <strong>AI-Assisted Assessment — Not a Clinical Diagnosis.</strong> All findings are generated automatically by the AI screening system and must be reviewed by a qualified ophthalmologist before any clinical decision is made. GradCAM regions indicate model attention areas, not confirmed lesion locations.
        </div>
      </div>

      {/* Recommendation */}
      {comp.recommendation && (
        <div style={{
          background: progConf.tone === 'danger' ? '#fff5f5' : progConf.tone === 'good' ? '#f0fdf4' : '#f0f9ff',
          border: `1px solid ${progConf.color}30`,
          borderRadius: 14, padding: '16px 20px', marginBottom: 20
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: progConf.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Assessment Recommendation
          </div>
          <div style={{ fontSize: 14, color: '#132b2e', lineHeight: 1.5, fontWeight: 500 }}>
            {comp.recommendation}
          </div>
        </div>
      )}

      {/* Per-eye sections */}
      {comp.progression_status !== 'baseline' ? (
        <div>
          <EyeComparisonSection eye="left" label="OS — Left Eye" comp={comp} />
          <EyeComparisonSection eye="right" label="OD — Right Eye" comp={comp} />
        </div>
      ) : (
        // Baseline: show current grades only
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Activity size={18} color="#0e6264" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: '#132b2e' }}>
              Baseline Examination Results
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>OS (Left Eye) — AI Classification</div>
              <GradeChip grade={comp.left_grade_curr} label="Current" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>OD (Right Eye) — AI Classification</div>
              <GradeChip grade={comp.right_grade_curr} label="Current" />
            </div>
          </div>
        </div>
      )}

      {/* Supporting Evidence */}
      {comp.supporting_evidence && comp.supporting_evidence.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Layers size={16} color="#0e6264" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#132b2e' }}>
              Supporting Evidence
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comp.supporting_evidence.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', background: '#f8faf9', borderRadius: 8 }}>
                <span style={{ color: '#0e6264', marginTop: 1, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.45 }}>{ev}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Explanation */}
      {comp.ai_explanation && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Info size={16} color="#0369a1" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#132b2e' }}>
              AI-Assisted Explanation
            </span>
            <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
              AUTOMATED RULE-BASED SUMMARY
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-line', fontFamily: 'var(--font-body)' }}>
            {comp.ai_explanation}
          </div>
        </div>
      )}

      {/* Lesion comparison placeholder */}
      <div style={{ background: '#f8faf9', border: '1px dashed #cbd5e1', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
          Lesion Comparison
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          Longitudinal lesion comparison (microaneurysms, haemorrhages, exudates) is not yet available. This section will be populated automatically when multi-visit lesion tracking is enabled.
        </div>
      </div>
    </div>
  );
}
