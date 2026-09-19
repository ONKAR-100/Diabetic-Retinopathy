import React from 'react';
import { 
  Activity, Info, Cpu, Clock, Compass, GitBranch, 
  CheckCircle2, AlertCircle, HelpCircle, AlertTriangle 
} from 'lucide-react';
import { BiomarkersResult } from '../types';

interface Props {
  biomarkers?: BiomarkersResult | null;
  eyeLabel?: string;
  odCoords?: { x?: number | null; y?: number | null; confidence?: number | null } | null;
  foveaCoords?: { x?: number | null; y?: number | null; confidence?: number | null } | null;
}

const formatNumber = (val: number | null | undefined, decimals = 4): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toFixed(decimals);
};

const formatInt = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toLocaleString();
};

export function RetinalBiomarkersPanel({ 
  biomarkers, 
  eyeLabel, 
  odCoords, 
  foveaCoords 
}: Props) {
  const isAvailable = Boolean(
    biomarkers && 
    biomarkers.status !== 'skipped' && 
    (biomarkers.avr !== null && biomarkers.avr !== undefined || 
     biomarkers.fractal_dimension !== null && biomarkers.fractal_dimension !== undefined)
  );

  const status = biomarkers?.status || (isAvailable ? 'completed' : 'unavailable');
  const isCompleted = status === 'completed';
  const isSkipped = status === 'skipped';
  const isFailed = status === 'failed' || status === 'error';

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e1ecea',
      borderRadius: 14,
      padding: 20,
      boxShadow: '0 2px 12px rgba(14, 98, 100, 0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#e6f4f2',
            color: '#0e6264',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Activity size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#132c2f', fontFamily: 'var(--font-display, sans-serif)' }}>
                Retinal Microvascular Biomarkers
              </h3>
              {eyeLabel && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono, monospace)',
                  background: '#f0f5f4',
                  color: '#2a5558',
                  padding: '2px 8px',
                  borderRadius: 6
                }}>
                  {eyeLabel}
                </span>
              )}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#688688' }}>
              Morphometric vessel caliber, branching complexity, and geometric tortuosity quantified via MATLAB Engine.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isCompleted && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              background: '#eaf8f4',
              color: '#167650',
              padding: '4px 10px',
              borderRadius: 20
            }}>
              <CheckCircle2 size={13} /> Completed
            </span>
          )}
          {isSkipped && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              background: '#fef7e7',
              color: '#926004',
              padding: '4px 10px',
              borderRadius: 20
            }}>
              <Info size={13} /> Computation Skipped
            </span>
          )}
          {isFailed && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              background: '#fdf2f2',
              color: '#b91c1c',
              padding: '4px 10px',
              borderRadius: 20
            }}>
              <AlertCircle size={13} /> Engine Error
            </span>
          )}
          {!isCompleted && !isSkipped && !isFailed && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              background: '#f1f5f5',
              color: '#527072',
              padding: '4px 10px',
              borderRadius: 20
            }}>
              <HelpCircle size={13} /> Not Computed
            </span>
          )}
          {biomarkers?.runtime_seconds !== undefined && biomarkers?.runtime_seconds !== null && (
            <span style={{
              fontSize: 11,
              color: '#658284',
              fontFamily: 'var(--font-mono, monospace)',
              background: '#f5f8f8',
              padding: '4px 8px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Clock size={12} /> {biomarkers.runtime_seconds.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Research Disclaimer Banner */}
      <div style={{
        background: '#f8faf9',
        border: '1px solid #e3edea',
        borderLeft: '4px solid #0e6264',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10
      }}>
        <AlertTriangle size={16} style={{ color: '#0e6264', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 11.5, color: '#3b585a', lineHeight: 1.45 }}>
          <strong style={{ color: '#16383a' }}>Research &amp; Exploratory Morphometry:</strong> Retinal microvascular biomarkers (AVR, tortuosity, fractal dimension) are computed via algorithmic image processing and morphological heuristics. The current vessel segmentation model does not explicitly classify arteries and veins; AVR is a caliber-based computational heuristic and is <em>not a clinically validated diagnostic measurement</em>.
        </div>
      </div>

      {/* Content: Cards Grid or Empty State */}
      {isAvailable ? (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14
          }}>
            {/* 1. Vascular Caliber & Ratio */}
            <div style={{
              background: '#fbfdfd',
              border: '1px solid #e5eded',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vascular Caliber &amp; Ratio
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#688688', background: '#eef4f3', padding: '1px 6px', borderRadius: 4 }}>
                    Heuristic
                  </span>
                </div>
                <div style={{ margin: '10px 0 6px' }}>
                  <div style={{ fontSize: 11, color: '#738e90', fontWeight: 600 }}>Arteriolar-to-Venular Ratio (AVR)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 24, fontWeight: 700, color: '#102a2d' }}>
                    {formatNumber(biomarkers?.avr, 4)}
                  </div>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#607c7f', lineHeight: 1.35 }}>
                  Parr-Hubbard-Knudtson formula evaluated across Zone B (1.0–1.5 OD diameters).
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid #edf2f1'
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>CRAE (Arteriolar)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {biomarkers?.crae_pixels !== null && biomarkers?.crae_pixels !== undefined ? `${biomarkers.crae_pixels.toFixed(2)} px` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>CRVE (Venular)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {biomarkers?.crve_pixels !== null && biomarkers?.crve_pixels !== undefined ? `${biomarkers.crve_pixels.toFixed(2)} px` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Vascular Tortuosity */}
            <div style={{
              background: '#fbfdfd',
              border: '1px solid #e5eded',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vascular Tortuosity
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#688688', background: '#eef4f3', padding: '1px 6px', borderRadius: 4 }}>
                    Morphology
                  </span>
                </div>
                <div style={{ margin: '10px 0 6px' }}>
                  <div style={{ fontSize: 11, color: '#738e90', fontWeight: 600 }}>Mean Distance Tortuosity (τ<sub>d</sub>)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 24, fontWeight: 700, color: '#102a2d' }}>
                    {formatNumber(biomarkers?.mean_tortuosity_distance, 4)}
                  </div>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#607c7f', lineHeight: 1.35 }}>
                  Arc length to straight-line chord length ratio minus 1 across skeleton branches.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid #edf2f1'
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>Curvature (τ<sub>c</sub>)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {formatNumber(biomarkers?.mean_tortuosity_curvature, 4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>Max Peak Tortuosity</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {formatNumber(biomarkers?.max_tortuosity, 4)}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Complexity & Branching Topology */}
            <div style={{
              background: '#fbfdfd',
              border: '1px solid #e5eded',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Complexity &amp; Topology
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#688688', background: '#eef4f3', padding: '1px 6px', borderRadius: 4 }}>
                    Box-Counting
                  </span>
                </div>
                <div style={{ margin: '10px 0 6px' }}>
                  <div style={{ fontSize: 11, color: '#738e90', fontWeight: 600 }}>Fractal Dimension (D<sub>f</sub>)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 24, fontWeight: 700, color: '#102a2d' }}>
                    {formatNumber(biomarkers?.fractal_dimension, 4)}
                  </div>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#607c7f', lineHeight: 1.35 }}>
                  Global vascular branching complexity across multi-scale grid partitions.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
                paddingTop: 8,
                borderTop: '1px solid #edf2f1'
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>Fit (R<sup>2</sup>)</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {formatNumber(biomarkers?.fractal_r_squared, 4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>Zone B Count</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {formatInt(biomarkers?.zone_b_count)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#779395' }}>Branches</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: '#163538' }}>
                    {formatInt(biomarkers?.branch_count)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Provenance & Landmark Reference Details */}
          <div style={{
            background: '#f9fbfb',
            border: '1px solid #edf2f1',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 11.5,
            color: '#557274',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Cpu size={13} style={{ color: '#0e6264' }} />
              <strong>Engine:</strong> MATLAB R2024b IPC (Zero-Array Transfer)
            </div>
            <div style={{ width: 1, height: 16, background: '#dfe8e7' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Compass size={13} style={{ color: '#0e6264' }} />
              <strong>Optic Disc Anchor:</strong>{' '}
              {odCoords?.x !== null && odCoords?.x !== undefined ? (
                <span>({odCoords.x.toFixed(1)}, {odCoords.y?.toFixed(1)}) · Conf: {((odCoords.confidence || 0) * 100).toFixed(0)}%</span>
              ) : (
                <span>Center Default / Fallback</span>
              )}
            </div>
            <div style={{ width: 1, height: 16, background: '#dfe8e7' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <GitBranch size={13} style={{ color: '#0e6264' }} />
              <strong>Fovea Status:</strong>{' '}
              {foveaCoords?.x !== null && foveaCoords?.x !== undefined ? (
                <span>({foveaCoords.x.toFixed(1)}, {foveaCoords.y?.toFixed(1)}) · Conf: {((foveaCoords.confidence || 0) * 100).toFixed(0)}%</span>
              ) : (
                <span style={{ color: '#826500' }}>Suppressed (Confidence &lt; 0.30 gate; Zone B anchored on OD)</span>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Empty / Skipped / Unavailable State */
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          background: '#fcfdfd',
          border: '1px dashed #dbe5e4',
          borderRadius: 10,
          color: '#658082'
        }}>
          <AlertCircle size={28} style={{ color: '#8da6a8', marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: '#254447' }}>
            {isSkipped 
              ? 'Biomarker Computation Skipped' 
              : isFailed 
              ? 'Biomarker Engine Execution Failed' 
              : 'No Retinal Biomarkers Available for this Examination'}
          </div>
          <p style={{ margin: '6px auto 0', maxWidth: 500, fontSize: 11.5, color: '#6d8a8c', lineHeight: 1.4 }}>
            {isSkipped 
              ? 'Biomarker processing was bypassed via the backend circuit breaker or disabled flag. Core AI grading and vessel density were not affected.'
              : isFailed
              ? `MATLAB Engine encountered an execution error${biomarkers?.error_message ? `: "${biomarkers.error_message}"` : ''}. Core screening analysis completed safely.`
              : 'Quantitative microvascular morphometry was not computed for this record (e.g., image quality ungradable, offline engine, or legacy Phase 1 examination).'}
          </p>
        </div>
      )}
    </div>
  );
}
