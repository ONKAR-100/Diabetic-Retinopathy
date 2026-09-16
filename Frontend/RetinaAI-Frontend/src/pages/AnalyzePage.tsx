import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { AnalysisPipeline, PIPELINE_STAGES } from '../components/AnalysisPipeline';
import { analyzeScreening } from '../services/screenings';

// Estimated time per stage before the final completion wait
const STAGE_DELAYS = [
  1200, // Stage 0: Quality Assessment
  1400, // Stage 1: Enhancement
  3200, // Stage 2: DR Classification
  2600, // Stage 3: Grad-CAM Generation
  3600, // Stage 4: Vessels & Landmarks
  // Stage 5 (Report Generation) has no timer: it waits for the real backend API call!
];

export default function AnalyzePage() {
  const { screening, setResult } = useScreening();
  const nav = useNavigate();

  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [isAllCompleted, setIsAllCompleted] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    };
  }, []);

  const runAnalysis = () => {
    if (!screening.screeningId) return;

    // Reset states
    setActiveStageIndex(0);
    setProgressPercent(0);
    setIsAllCompleted(false);
    setIsError(false);
    setErrorMessage(null);
    navigatedRef.current = false;

    // Advance stage progression realistically while waiting for the real backend
    const scheduleNextStage = (currentIndex: number) => {
      if (currentIndex >= STAGE_DELAYS.length) {
        // We have reached Stage 5 (Report Generation).
        // DO NOT advance automatically! Stay at stage 5 and wait for the real API call!
        setActiveStageIndex(5);
        setProgressPercent(83.3);
        return;
      }

      const delay = STAGE_DELAYS[currentIndex];
      stageTimerRef.current = setTimeout(() => {
        if (unmountedRef.current || isAllCompleted || isError) return;
        const nextIndex = currentIndex + 1;
        setActiveStageIndex(nextIndex);
        const pct = (nextIndex / PIPELINE_STAGES.length) * 100;
        setProgressPercent(Math.round(pct * 10) / 10);
        scheduleNextStage(nextIndex);
      }, delay);
    };

    scheduleNextStage(0);

    // TRIGGER THE ACTUAL BACKEND AI PIPELINE API
    analyzeScreening(screening.screeningId, 'both')
      .then(res => {
        if (unmountedRef.current) return;

        // Clear any remaining timers
        if (stageTimerRef.current) clearTimeout(stageTimerRef.current);

        // Format and store results
        const result = {
          screening_id: res.screening_id || res.id || screening.screeningId,
          left_eye: res.left_eye || null,
          right_eye: res.right_eye || null,
          overall_referable: res.overall_referable ?? false,
          recommendation: res.recommendation || '',
          review_status: res.review_status || 'not_required',
        };
        setResult(result as any);

        // 1. Mark all stages as completed
        setActiveStageIndex(PIPELINE_STAGES.length);
        // 2. Set overall progress to exactly 100%
        setProgressPercent(100);
        // 3. Mark complete
        setIsAllCompleted(true);

        // 4. Show the completion state briefly (700ms), then automatically navigate
        setTimeout(() => {
          if (!navigatedRef.current && !unmountedRef.current) {
            navigatedRef.current = true;
            nav('/screening/result');
          }
        }, 700);
      })
      .catch(err => {
        if (unmountedRef.current) return;
        console.error('Analysis pipeline execution error:', err);

        if (stageTimerRef.current) clearTimeout(stageTimerRef.current);

        const msg =
          err?.response?.data?.detail ||
          err?.message ||
          'Failed to complete AI model execution. Please check backend service status.';

        setIsError(true);
        setErrorMessage(msg);
      });
  };

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screening.screeningId]);

  if (!screening.screeningId) {
    return (
      <>
        <SectionHeader title="AI Analysis" />
        <Stepper active={3} />
        <Card style={{ maxWidth: 560, margin: '32px auto', textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 20 }}>
            No active screening session found. Please start a screening and capture retinal photographs first.
          </p>
          <Button variant="primary" onClick={() => nav('/screening/capture')}>
            Go to Image Capture
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title="AI Analysis"
        description="Deep learning models evaluate retinal photographs across quality, classification, segmentation, and explainability dimensions."
      />
      <Stepper active={3} />

      <div style={{ maxWidth: 880, margin: '24px auto' }}>
        <AnalysisPipeline
          activeStageIndex={activeStageIndex}
          isAllCompleted={isAllCompleted}
          isError={isError}
          errorMessage={errorMessage}
          progressPercent={progressPercent}
          onRetry={runAnalysis}
        />
      </div>
    </>
  );
}
