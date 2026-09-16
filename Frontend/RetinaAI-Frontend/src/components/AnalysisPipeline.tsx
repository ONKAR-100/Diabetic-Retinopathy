import React from 'react';
import { Check, X, Sparkles, Activity, AlertCircle, RotateCcw } from 'lucide-react';
import { Card, Button } from '../components';

export interface StageInfo {
  id: string;
  name: string;
  shortName: string;
  model: string;
  description: string;
  runningText: string;
}

export const PIPELINE_STAGES: StageInfo[] = [
  {
    id: 'quality',
    name: 'Image Quality Assessment',
    shortName: 'Quality',
    model: 'Fast ROI + Multi-metric IQA',
    description: 'Verifying sharpness, exposure, contrast & field of view',
    runningText: 'Analyzing retinal image quality and diagnostic suitability…',
  },
  {
    id: 'enhancement',
    name: 'Retinal Enhancement',
    shortName: 'Enhancement',
    model: 'CLAHE + Illumination Norm',
    description: 'Illumination equalization and retinal contrast optimization',
    runningText: 'Enhancing contrast and normalizing retinal illumination…',
  },
  {
    id: 'dr_classification',
    name: 'DR Classification',
    shortName: 'DR Grade',
    model: 'EfficientNet-B2 (5-Class)',
    description: 'Evaluating diabetic retinopathy severity grade (0 to 4)',
    runningText: 'Running deep learning classification for Diabetic Retinopathy…',
  },
  {
    id: 'gradcam',
    name: 'Grad-CAM Generation',
    shortName: 'Grad-CAM',
    model: 'Feature Gradient Heatmap',
    description: 'Generating visual feature attribution attention heatmaps',
    runningText: 'Generating Grad-CAM visual attention explanation…',
  },
  {
    id: 'vessels_landmarks',
    name: 'Vessels & Landmarks',
    shortName: 'Vessels & Fovea',
    model: 'U-Net ResNet34 + ResUNet',
    description: 'Segmenting vasculature & localizing optic disc and fovea',
    runningText: 'Segmenting retinal blood vessels and anatomical landmarks…',
  },
  {
    id: 'report',
    name: 'AI Diagnostic Explainability Report Generation',
    shortName: 'Explainability Report',
    model: 'Diagnostic Synthesis Engine',
    description: 'Compiling findings, calibrated confidence & referral advice',
    runningText: 'Synthesizing AI diagnostic explainability report & findings…',
  },
];

interface AnalysisPipelineProps {
  activeStageIndex: number;
  isAllCompleted: boolean;
  isError: boolean;
  errorMessage?: string | null;
  progressPercent: number;
  onRetry?: () => void;
}

function CircularStageIndicator({
  status,
  number,
}: {
  status: 'pending' | 'running' | 'completed' | 'failed';
  number: number;
}) {
  if (status === 'completed') {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#e6f5f2',
          border: '2.5px solid #1d735c',
          display: 'grid',
          placeItems: 'center',
          color: '#1d735c',
          boxShadow: '0 4px 12px rgba(29, 115, 92, 0.18)',
          transition: 'all 0.35s ease',
        }}
      >
        <Check size={24} strokeWidth={2.8} />
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#fceced',
          border: '2.5px solid #b73d44',
          display: 'grid',
          placeItems: 'center',
          color: '#b73d44',
          boxShadow: '0 4px 12px rgba(183, 61, 68, 0.18)',
        }}
      >
        <X size={24} strokeWidth={2.8} />
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {/* Animated Circular Progress Ring */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: 48,
            height: 48,
            animation: 'spin 1.2s linear infinite',
          }}
          viewBox="0 0 48 48"
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#e2eceb"
            strokeWidth="3.5"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#0e6264"
            strokeWidth="4"
            strokeDasharray="45 120"
            strokeLinecap="round"
          />
        </svg>

        {/* Center Number with subtle pulse */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: '#0e6264',
          }}
        >
          {String(number).padStart(2, '0')}
        </span>
      </div>
    );
  }

  // Pending (Inactive) State
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#f8faf9',
        border: '2px dashed #d6e2e2',
        display: 'grid',
        placeItems: 'center',
        color: '#8da0a1',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {String(number).padStart(2, '0')}
    </div>
  );
}

export function AnalysisPipeline({
  activeStageIndex,
  isAllCompleted,
  isError,
  errorMessage,
  progressPercent,
  onRetry,
}: AnalysisPipelineProps) {
  const currentStage = PIPELINE_STAGES[activeStageIndex] || PIPELINE_STAGES[0];

  return (
    <Card style={{ padding: 32, borderRadius: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#0e6264',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Automated Clinical AI Pipeline
        </span>
        <h2
          style={{
            margin: '6px 0 6px',
            fontSize: 22,
            fontFamily: 'var(--font-display)',
            color: 'var(--ink)',
          }}
        >
          Processing Retinal Examination
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', maxWidth: 520, marginInline: 'auto' }}>
          Multiple deep learning architectures are analyzing retinal structural integrity, microvascular abnormalities, and lesion biomarkers.
        </p>
      </div>

      {/* 6-Stage Circular Progress Pipeline Grid (2 rows of 3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 32,
        }}
      >
        {PIPELINE_STAGES.map((stage, idx) => {
          const isCompleted = idx < activeStageIndex || isAllCompleted;
          const isRunning = idx === activeStageIndex && !isAllCompleted && !isError;
          const isFailed = idx === activeStageIndex && isError;
          const status = isCompleted
            ? 'completed'
            : isFailed
            ? 'failed'
            : isRunning
            ? 'running'
            : 'pending';

          const cardBg = isCompleted
            ? '#f5fbf9'
            : isRunning
            ? '#f0f9f8'
            : isFailed
            ? '#fff5f5'
            : '#ffffff';

          const cardBorder = isCompleted
            ? '#bfe7dc'
            : isRunning
            ? '#88cecb'
            : isFailed
            ? '#fecaca'
            : '#e8f0f0';

          return (
            <div
              key={stage.id}
              style={{
                background: cardBg,
                border: `1.5px solid ${cardBorder}`,
                borderRadius: 16,
                padding: '20px 14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'all 0.3s ease',
                position: 'relative',
              }}
            >
              {/* Circular Indicator */}
              <div style={{ marginBottom: 12 }}>
                <CircularStageIndicator status={status} number={idx + 1} />
              </div>

              {/* Stage Name */}
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: isRunning ? '#0e6264' : isCompleted ? '#142426' : '#6c7b7e',
                  marginBottom: 3,
                  lineHeight: 1.25,
                }}
              >
                {stage.name}
              </div>

              {/* Model Tag */}
              <div
                style={{
                  fontSize: 10.5,
                  color: isRunning ? '#0e6264' : '#889a9c',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 12,
                }}
              >
                {stage.model}
              </div>

              {/* Status Pill Badge */}
              <div style={{ marginTop: 'auto' }}>
                {isCompleted && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#1d735c',
                      background: '#e6f5f2',
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    <Check size={11} strokeWidth={3} /> Completed
                  </span>
                )}

                {isRunning && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#0e6264',
                      background: '#dff2f0',
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#0e6264',
                        animation: 'pulse 1.2s infinite',
                      }}
                    />
                    Running…
                  </span>
                )}

                {status === 'pending' && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: '#97a8a9',
                      background: '#f4f8f8',
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    Waiting
                  </span>
                )}

                {isFailed && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#b73d44',
                      background: '#fceced',
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    <X size={11} strokeWidth={3} /> Failed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall Progress Section */}
      <div
        style={{
          background: '#f9fbfb',
          border: '1px solid #e5eded',
          borderRadius: 16,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            Analysis Progress
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: isAllCompleted ? '#1d735c' : '#0e6264',
            }}
          >
            {Math.round(progressPercent)}% Complete
          </span>
        </div>

        {/* Progress Bar Track */}
        <div
          style={{
            height: 10,
            background: '#e2eceb',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 14,
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, progressPercent))}%`,
              background: isAllCompleted
                ? 'linear-gradient(90deg, #1d735c, #2a9d8f)'
                : isError
                ? '#b73d44'
                : 'linear-gradient(90deg, #0e6264, #52c8b8)',
              borderRadius: 999,
              transition: 'width 0.45s ease',
            }}
          />
        </div>

        {/* Dynamic Status Message */}
        {isAllCompleted ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#065f46',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Check size={18} color="#059669" strokeWidth={2.8} />
            <div>
              <strong>Analysis Complete!</strong> All retinal evaluation models finished successfully. Opening results…
            </div>
          </div>
        ) : isError ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              color: '#991b1b',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={18} color="#dc2626" />
              <div>
                <strong>Analysis Failed:</strong> {errorMessage || 'An error occurred during model execution.'}
              </div>
            </div>
            {onRetry && (
              <Button variant="danger" onClick={onRetry} style={{ padding: '6px 14px', fontSize: 12 }}>
                <RotateCcw size={13} /> Retry Analysis
              </Button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: '#345356',
            }}
          >
            <Activity size={16} color="#0e6264" />
            <span>
              <strong>Running:</strong> {currentStage.runningText}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
