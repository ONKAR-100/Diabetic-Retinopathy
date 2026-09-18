import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { generateReport, fetchReportPdfBlobUrl } from '../services/reports';

type Phase = 'generating' | 'ready' | 'error';

export default function ReportPage() {
  const { screening, reset } = useScreening();
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>('generating');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-generate PDF and load authenticated blob when the page mounts
  useEffect(() => {
    let currentBlobUrl: string | null = null;
    let isMounted = true;

    if (!screening.screeningId) {
      setPhase('error');
      setErrorMsg('No active screening found. Please start a new screening.');
      return;
    }

    setPhase('generating');
    generateReport(screening.screeningId)
      .then(async () => {
        const url = await fetchReportPdfBlobUrl(screening.screeningId as string);
        if (isMounted) {
          currentBlobUrl = url;
          setPdfUrl(url);
          setPhase('ready');
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(async err => {
        console.error('Report generation failed:', err);
        setErrorMsg('Report generation failed. You can still try downloading directly.');
        try {
          const url = await fetchReportPdfBlobUrl(screening.screeningId as string);
          if (isMounted) {
            currentBlobUrl = url;
            setPdfUrl(url);
          } else {
            URL.revokeObjectURL(url);
          }
        } catch {
          // Ignore secondary fetch error
        }
        if (isMounted) setPhase('error');
      });

    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [screening.screeningId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewScreening = () => {
    reset();
    nav('/screening/new');
  };

  return (
    <>
      <SectionHeader
        eyebrow="06 · Final Report"
        title="Screening Report"
        description="AI-generated clinical summary with grading, recommendations, and explainability."
      />
      <Stepper active={6} />

      {/* Status banner */}
      {phase === 'generating' && (
        <Card style={{ marginTop: 24, textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h3 style={{ marginBottom: 8 }}>Generating Report…</h3>
          <p style={{ color: '#888' }}>Please wait while we compile the AI diagnostic summary.</p>
        </Card>
      )}

      {phase === 'error' && !pdfUrl && (
        <Card style={{ marginTop: 24, textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ marginBottom: 8, color: '#c53030' }}>Report Error</h3>
          <p style={{ color: '#888', marginBottom: 16 }}>{errorMsg}</p>
          <Button variant="secondary" onClick={() => nav('/screening/result')}>← Back to Results</Button>
        </Card>
      )}

      {/* PDF preview — shown when ready or when error but URL still available */}
      {pdfUrl && (phase === 'ready' || phase === 'error') && (
        <>
          {phase === 'error' && (
            <Card style={{ marginTop: 16, padding: '12px 16px', background: '#fff3cd', borderColor: '#ffc107' }}>
              <p style={{ margin: 0, color: '#856404' }}>⚠️ {errorMsg} — displaying available report below.</p>
            </Card>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Button onClick={() => window.open(pdfUrl, '_blank')}>
              📄 View Complete Report (New Tab)
            </Button>
            <Button
              onClick={() => {
                const a = document.createElement('a');
                a.href = pdfUrl;
                a.download = `RetinaAI_Report_${screening.screeningId}.pdf`;
                a.click();
              }}
            >
              ⬇ Download PDF
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>🖨 Print</Button>
            <Button variant="ghost" onClick={handleNewScreening}>+ New Screening</Button>
          </div>

          {/* Inline PDF viewer */}
          <Card style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
            <iframe
              src={pdfUrl}
              title="Screening Report"
              width="100%"
              height="800px"
              style={{ border: 'none', display: 'block' }}
            />
          </Card>
        </>
      )}

      {/* Navigation row */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Button variant="secondary" onClick={() => nav('/screening/review')}>← Back to Review</Button>
        <Button variant="ghost" onClick={() => nav('/')}>🏠 Dashboard</Button>
      </div>
    </>
  );
}
