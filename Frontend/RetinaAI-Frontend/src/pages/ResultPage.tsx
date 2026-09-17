import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, GradeBadge, Button, Badge } from '../components';
import { RetinalBiomarkerSummary } from '../components/RetinalBiomarkerSummary';
import { useScreening } from '../contexts/ScreeningContext';
import { useAuth } from '../contexts/AuthContext';

export default function ResultPage() {
  const { screening } = useScreening();
  const nav = useNavigate();
  const { isDoctor } = useAuth();
  const res = screening.result;

  if (!res) return <div>No result</div>;

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
