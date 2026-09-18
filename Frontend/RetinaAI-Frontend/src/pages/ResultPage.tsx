import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SectionHeader, Stepper, Card, GradeBadge, Button, Badge } from '../components';
import { RetinalBiomarkerSummary } from '../components/RetinalBiomarkerSummary';
import { useScreening } from '../contexts/ScreeningContext';
import { useAuth } from '../contexts/AuthContext';
import { getScreening } from '../services/screenings';

export default function ResultPage() {
  const { screening, setResult, setScreeningId, setPatient } = useScreening();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDoctor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryId = searchParams.get('id');
  const res = screening.result;

  useEffect(() => {
    // If result is already present in context, retain existing behavior
    if (res) return;

    if (queryId) {
      setLoading(true);
      setError(null);
      getScreening(queryId)
        .then(data => {
          if (data && (data.left_eye || data.right_eye || data.overall_referable !== undefined)) {
            setScreeningId(data.screening_id || data.id || queryId);
            if (data.patient_id) {
              setPatient(data.patient_id, data.patient_name || '');
            }
            setResult(data as any);
          } else {
            setError(`Screening '${queryId}' does not have completed analysis results.`);
          }
        })
        .catch(err => {
          setError(err?.response?.data?.detail || 'Failed to load screening result.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [queryId, res, setResult, setScreeningId, setPatient]);

  if (loading) {
    return (
      <>
        <SectionHeader title="AI Screening Result" />
        <Stepper active={4} />
        <Card style={{ marginTop: 24, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 18, color: 'var(--muted)', margin: 0 }}>⏳ Loading screening results…</p>
        </Card>
      </>
    );
  }

  if (!res) {
    return (
      <>
        <SectionHeader title="AI Screening Result" />
        <Stepper active={4} />
        <Card style={{ marginTop: 24, textAlign: 'center', padding: '48px 24px' }}>
          <h3 style={{ marginBottom: 12 }}>No Screening Result Available</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
            {error || 'No screening result found. Please capture images or select an existing screening from history.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={() => nav('/screening/capture')}>← Go to Capture</Button>
            <Button variant="primary" onClick={() => nav('/history')}>View History</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader title="AI Screening Result" />
      <Stepper active={4} />
      <Card style={{ marginTop: 24, textAlign: 'center', padding: '32px 16px' }}>
        <h2 style={{ marginBottom: 16 }}>Overall Recommendation</h2>
        {res.overall_referable ? <Badge tone="danger">REFERABLE DR DETECTED</Badge> : <Badge tone="good">NON-REFERABLE</Badge>}
        <p style={{ marginTop: 16 }}>{res.recommendation}</p>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <Card>
          <h3>Left Eye</h3>
          <div style={{ margin: '16px 0' }}><GradeBadge grade={res.left_eye?.dr_grade || 0} /></div>
          <p>Confidence: {((res.left_eye?.confidence_calibrated || 0) * 100).toFixed(1)}%</p>
        </Card>
        <Card>
          <h3>Right Eye</h3>
          <div style={{ margin: '16px 0' }}><GradeBadge grade={res.right_eye?.dr_grade || 0} /></div>
          <p>Confidence: {((res.right_eye?.confidence_calibrated || 0) * 100).toFixed(1)}%</p>
        </Card>
      </div>

      <RetinalBiomarkerSummary leftEye={res.left_eye} rightEye={res.right_eye} />
      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => nav('/screening/capture')}>← Capture &amp; Quality</Button>
          <Button variant="secondary" onClick={() => nav(screening.patientId ? `/patients/${screening.patientId}` : '/patients')}>
            Patient Profile
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => nav('/screening/explain')}>View Explainability</Button>
          {screening.screeningId && (
            <Button 
              onClick={() => nav(`/comparison/${screening.screeningId}`)} 
              style={{ background: '#0284c7', color: '#fff' }}
            >
              View Longitudinal Progression →
            </Button>
          )}
          {isDoctor && <Button onClick={() => nav('/screening/review')}>Perform Review</Button>}
          {!isDoctor && <Button onClick={() => nav('/screening/report')}>Generate Report</Button>}
        </div>
      </div>
    </>
  );
}
