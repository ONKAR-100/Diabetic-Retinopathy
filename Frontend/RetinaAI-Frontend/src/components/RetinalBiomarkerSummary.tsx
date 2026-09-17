import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { EyeResult, BiomarkersResult } from '../types';

interface Props {
  leftEye?: EyeResult | null;
  rightEye?: EyeResult | null;
}

const formatNumber = (val: number | null | undefined, decimals = 4): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toFixed(decimals);
};

const formatInt = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toLocaleString();
};

interface EyeBiomarkerData {
  density: number | null | undefined;
  crae: number | null | undefined;
  crve: number | null | undefined;
  avr: number | null | undefined;
  tortuosity: number | null | undefined;
  fractalDim: number | null | undefined;
  branchCount: number | null | undefined;
  zoneBCount: number | null | undefined;
  status: string | null | undefined;
  isAvailable: boolean;
}

function extractBiomarkers(eye?: EyeResult | null): EyeBiomarkerData {
  if (!eye) {
    return {
      density: null,
      crae: null,
      crve: null,
      avr: null,
      tortuosity: null,
      fractalDim: null,
      branchCount: null,
      zoneBCount: null,
      status: null,
      isAvailable: false,
    };
  }

  const bm: BiomarkersResult | null | undefined = eye.biomarkers;
  const avr = bm?.avr ?? eye.avr ?? null;
  const fractalDim = bm?.fractal_dimension ?? eye.fractal_dimension ?? null;
  const tortuosity = bm?.mean_tortuosity_distance ?? eye.vessel_tortuosity ?? null;
  const density = eye.vessel_density ?? bm?.vessel_density ?? null;
  const crae = bm?.crae_pixels ?? null;
  const crve = bm?.crve_pixels ?? null;
  const branchCount = bm?.branch_count ?? null;
  const zoneBCount = bm?.zone_b_count ?? null;
  const status = bm?.status ?? (avr !== null || fractalDim !== null ? 'completed' : null);

  const isAvailable = Boolean(
    (avr !== null && avr !== undefined) ||
    (fractalDim !== null && fractalDim !== undefined) ||
    (density !== null && density !== undefined)
  );

  return {
    density,
    crae,
    crve,
    avr,
    tortuosity,
    fractalDim,
    branchCount,
    zoneBCount,
    status,
    isAvailable,
  };
}

export function RetinalBiomarkerSummary({ leftEye, rightEye }: Props) {
  const left = extractBiomarkers(leftEye);
  const right = extractBiomarkers(rightEye);

  const renderEyeColumn = (
    label: string,
    subLabel: string,
    eyeResult: EyeResult | null | undefined,
    data: EyeBiomarkerData
  ) => {
    if (!eyeResult) {
      return (
        <div style={{
          background: '#fcfdfd',
          border: '1px dashed #dce6e5',
          borderRadius: 10,
          padding: 18,
          textAlign: 'center',
          color: '#718e90'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#27474a', marginBottom: 4 }}>
            {label} ({subLabel})
          </div>
          <div style={{ fontSize: 12, color: '#88a3a5', marginTop: 12 }}>
            Image not captured or eye not examined.
          </div>
        </div>
      );
    }

    const rows = [
      {
        label: 'Vessel Density',
        value: data.density !== null && data.density !== undefined ? `${data.density.toFixed(4)} (${(data.density * 100).toFixed(1)}%)` : '—'
      },
      {
        label: 'CRAE (Arteriolar)',
        value: data.crae !== null && data.crae !== undefined ? `${data.crae.toFixed(2)} px` : '—'
      },
      {
        label: 'CRVE (Venular)',
        value: data.crve !== null && data.crve !== undefined ? `${data.crve.toFixed(2)} px` : '—'
      },
      {
        label: 'AVR (Caliber Ratio)',
        value: formatNumber(data.avr, 4)
      },
      {
        label: 'Tortuosity (Distance τd)',
        value: formatNumber(data.tortuosity, 4)
      },
      {
        label: 'Fractal Dimension (Df)',
        value: formatNumber(data.fractalDim, 4)
      },
      {
        label: 'Branch Count',
        value: formatInt(data.branchCount)
      },
      {
        label: 'Zone B Vessel Count',
        value: formatInt(data.zoneBCount)
      },
    ];

    return (
      <div style={{
        background: '#fbfdfd',
        border: '1px solid #e5eded',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          {/* Eye Column Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid #edf2f1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#132c2f' }}>
                {label}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono, monospace)',
                background: '#eef4f3',
                color: '#2a5558',
                padding: '2px 8px',
                borderRadius: 6
              }}>
                {subLabel}
              </span>
            </div>
            {data.isAvailable ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                background: '#eaf8f4',
                color: '#167650',
                padding: '3px 8px',
                borderRadius: 12
              }}>
                <CheckCircle2 size={12} /> Measured
              </span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                background: '#f5f8f8',
                color: '#718e90',
                padding: '3px 8px',
                borderRadius: 12
              }}>
                <AlertCircle size={12} /> Not Available
              </span>
            )}
          </div>

          {/* Metric Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, idx) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: idx % 2 === 0 ? 'rgba(240, 246, 245, 0.4)' : 'transparent',
                  fontSize: 12.5
                }}
              >
                <span style={{ color: '#516f72' }}>{r.label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 600,
                  color: r.value === '—' ? '#9fb1b3' : '#143134'
                }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e1ecea',
      borderRadius: 14,
      padding: 20,
      marginTop: 24,
      boxShadow: '0 2px 10px rgba(14, 98, 100, 0.04)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#e6f4f2',
          color: '#0e6264',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Activity size={18} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#132c2f', fontFamily: 'var(--font-display, sans-serif)' }}>
            Retinal Microvascular Biomarkers Summary
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#688688' }}>
            Objective morphometric vascular caliber, complexity, and density measurements from the screening pipeline.
          </p>
        </div>
      </div>

      {/* 2-Eye Side-by-Side Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16
      }}>
        {renderEyeColumn('Left Eye', 'OS', leftEye, left)}
        {renderEyeColumn('Right Eye', 'OD', rightEye, right)}
      </div>

      {/* Research Disclaimer Footer */}
      <div style={{
        marginTop: 16,
        padding: '10px 14px',
        background: '#f8faf9',
        border: '1px solid #e3edea',
        borderLeft: '4px solid #0e6264',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10
      }}>
        <AlertTriangle size={15} style={{ color: '#0e6264', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 11.5, color: '#3b585a', lineHeight: 1.45 }}>
          <strong style={{ color: '#16383a' }}>Research Morphometry Notice:</strong> Retinal microvascular biomarkers (AVR, tortuosity, fractal dimension) are morphometric measurements computed via algorithmic image analysis. AVR is a caliber-based computational heuristic and not a standalone clinical diagnosis.
        </div>
      </div>
    </div>
  );
}
