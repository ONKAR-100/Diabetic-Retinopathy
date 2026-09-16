import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

write_file("src/pages/LoginPage.tsx", """
import React, { useState } from 'react';
import { Eye, CheckCircle2, ArrowRight, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card } from '../components';

export default function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      nav('/');
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-left">
        <div className="brand">
          <div className="brand-mark"><Eye size={18} /></div>
          <div><div className="brand-name">RetinaAI</div><div className="brand-sub">DR Screening</div></div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">AI-ASSISTED SCREENING</span>
          <h1>Bring clearer retinal screening to primary healthcare.</h1>
          <p>A focused clinical workstation for image quality coaching, AI-assisted assessment, explainability, human review, and referral support.</p>
          <div className="login-points">
            <div><CheckCircle2 size={17} /><span>Offline-ready workflow</span></div>
            <div><CheckCircle2 size={17} /><span>Human-in-the-loop review</span></div>
            <div><CheckCircle2 size={17} /><span>Model evidence made visible</span></div>
          </div>
        </div>
        <div className="login-foot">SIH 26038 A Explainable AI for Diabetic Retinopathy Screening in Rural India</div>
      </div>
      <div className="login-right">
        <Card className="login-card">
          <div className="login-head">
            <span className="eyebrow">SECURE SIGN IN</span>
            <h2>Welcome back</h2>
            <p>Use your credentials to access the screening workstation.</p>
          </div>
          <form onSubmit={handleSubmit}>
            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
            <label className="field">ID
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. hw_user" />
            </label>
            <label className="field">Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            <Button type="submit" className="full" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={16} /></Button>
          </form>
          <div className="login-note"><LockKeyhole size={15} /> Designed for AI-assisted diabetic retinopathy screening.</div>
        </Card>
      </div>
    </div>
  );
}
""")

write_file("src/pages/DashboardPage.tsx", """
import React, { useEffect, useState } from 'react';
import { Users, AlertTriangle, Clock, ListChecks } from 'lucide-react';
import { SectionHeader, MetricCard, Card, Badge, Button } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { getAnalyticsSummary } from '../services/analytics';
import { listScreenings } from '../services/screenings';
import { AnalyticsSummary, ScreeningResult } from '../types';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const { user, isDoctor } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<ScreeningResult[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [sum, rec] = await Promise.all([
          getAnalyticsSummary().catch(() => null),
          listScreenings({ page: 1 }).catch(() => ({ items: [] }))
        ]);
        if (sum) setSummary(sum);
        if (rec) setRecent(rec.items || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <>
      <SectionHeader title={`Good morning, ${user?.full_name || 'User'}.`} description="Overview of your centre's screening activity and AI insights." action={isDoctor ? <Button onClick={() => nav('/review/queue')}>Review Queue ({summary?.pending_reviews || 0})</Button> : <Button onClick={() => nav('/screening/new')}>New Screening</Button>} />
      <div className="metric-grid">
        <MetricCard label="Total Screenings" value={summary?.total_screenings || 0} icon={Users} />
        <MetricCard label="Referable Cases" value={summary?.referable_cases || 0} icon={AlertTriangle} />
        <MetricCard label="Pending Reviews" value={summary?.pending_reviews || 0} icon={ListChecks} />
        <MetricCard label="Recapture Rate" value={`${((summary?.recapture_rate || 0) * 100).toFixed(1)}%`} icon={Clock} />
      </div>
      <Card style={{ marginTop: 24 }}>
        <h3>Recent Screenings</h3>
        <table style={{ width: '100%', textAlign: 'left', marginTop: 16 }}>
          <thead>
            <tr><th>Patient</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {recent.slice(0, 5).map(s => (
              <tr key={s.screening_id}>
                <td>{s.patient_name}</td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                <td><Badge tone={s.status === 'complete' ? 'good' : 'warn'}>{s.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
""")

write_file("src/pages/NewScreeningPage.tsx", """
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Card, Button, Stepper } from '../components';
import { createPatient } from '../services/patients';
import { createScreening } from '../services/screenings';
import { useScreening } from '../contexts/ScreeningContext';

export default function NewScreeningPage() {
  const [formData, setFormData] = useState({ name: '', age: '', sex: 'M', diabetes_duration: '' });
  const [loading, setLoading] = useState(false);
  const { setPatient, setScreeningId } = useScreening();
  const nav = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const patient = await createPatient({ ...formData, age: Number(formData.age), diabetes_duration: Number(formData.diabetes_duration) });
      const screening = await createScreening(patient.id);
      setPatient(patient.id, patient.name);
      setScreeningId(screening.screening_id);
      nav('/screening/capture');
    } catch (err) {
      console.error(err);
      alert('Error creating screening');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SectionHeader title="New Screening" />
      <Stepper active={1} />
      <Card style={{ maxWidth: 600, margin: '0 auto', marginTop: 32 }}>
        <h3>Patient Details</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="field">Name<input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></label>
          <label className="field">Age<input required type="number" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} /></label>
          <label className="field">Sex
            <select value={formData.sex} onChange={e => setFormData({ ...formData, sex: e.target.value })}>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </label>
          <label className="field">Diabetes Duration (years)<input required type="number" value={formData.diabetes_duration} onChange={e => setFormData({ ...formData, diabetes_duration: e.target.value })} /></label>
          <Button type="submit" disabled={loading}>{loading ? 'Starting...' : 'Start Screening'}</Button>
        </form>
      </Card>
    </>
  );
}
""")

write_file("src/pages/CapturePage.tsx", """
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { ImageUploader } from '../components/ImageUploader';
import { useScreening } from '../contexts/ScreeningContext';
import { uploadImage } from '../services/screenings';

export default function CapturePage() {
  const { screening, setImage } = useScreening();
  const nav = useNavigate();
  const [activeEye, setActiveEye] = useState<'left'|'right'>('left');
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File, previewUrl: string) => {
    setImage(activeEye, file, previewUrl);
    setLoading(true);
    try {
      if (screening.screeningId) {
        await uploadImage(screening.screeningId, activeEye, file);
      }
    } catch (err) {
      alert('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const canContinue = screening.leftImageFile && screening.rightImageFile;

  return (
    <>
      <SectionHeader title="Image Capture" />
      <Stepper active={2} />
      <Card style={{ marginTop: 24 }}>
        <div className="eye-tabs" style={{ marginBottom: 24 }}>
          <button className={activeEye === 'left' ? 'active' : ''} onClick={() => setActiveEye('left')}>Left Eye</button>
          <button className={activeEye === 'right' ? 'active' : ''} onClick={() => setActiveEye('right')}>Right Eye</button>
        </div>
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <ImageUploader 
            eye={activeEye === 'left' ? 'Left Eye' : 'Right Eye'} 
            onFile={handleFile} 
            preview={activeEye === 'left' ? screening.leftPreviewUrl : screening.rightPreviewUrl} 
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button onClick={() => nav('/screening/quality')} disabled={!canContinue || loading}>Check Image Quality</Button>
        </div>
      </Card>
    </>
  );
}
""")

write_file("src/pages/QualityPage.tsx", """
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button, Progress } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { getScreening } from '../services/screenings';
import { RecaptureAlert } from '../components/RecaptureAlert';

export default function QualityPage() {
  const { screening } = useScreening();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (screening.screeningId) {
      getScreening(screening.screeningId).then(setData);
    }
  }, [screening.screeningId]);

  if (!data) return <div>Checking quality...</div>;

  const lq = data.left_eye?.quality;
  const rq = data.right_eye?.quality;

  const needsRecapture = lq?.status === 'ungradable' || rq?.status === 'ungradable';

  return (
    <>
      <SectionHeader title="Quality Check" />
      <Stepper active={3} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <Card>
          <h3>Left Eye</h3>
          {lq?.status === 'ungradable' && <RecaptureAlert reason={lq.reason} message={lq.recapture_message} />}
          <Progress label="Focus" value={lq?.scores?.focus || 0} />
          <Progress label="Brightness" value={lq?.scores?.brightness || 0} />
        </Card>
        <Card>
          <h3>Right Eye</h3>
          {rq?.status === 'ungradable' && <RecaptureAlert reason={rq.reason} message={rq.recapture_message} />}
          <Progress label="Focus" value={rq?.scores?.focus || 0} />
          <Progress label="Brightness" value={rq?.scores?.brightness || 0} />
        </Card>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        {needsRecapture ? (
          <Button onClick={() => nav('/screening/capture')}>Recapture Required</Button>
        ) : (
          <Button onClick={() => nav('/screening/analyze')}>Continue to Analysis</Button>
        )}
      </div>
    </>
  );
}
""")

write_file("src/pages/AnalyzePage.tsx", """
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { AnalysisPipeline } from '../components/AnalysisPipeline';
import { analyzeScreening } from '../services/screenings';

export default function AnalyzePage() {
  const { screening, setResult } = useScreening();
  const nav = useNavigate();

  useEffect(() => {
    if (screening.screeningId) {
      analyzeScreening(screening.screeningId, 'both').then(res => {
        setResult(res);
      }).catch(err => {
        console.error(err);
        alert('Analysis failed. Check backend.');
      });
    }
  }, [screening.screeningId, setResult]);

  return (
    <>
      <SectionHeader title="AI Analysis" />
      <Stepper active={4} />
      <div style={{ maxWidth: 600, margin: '24px auto' }}>
        <AnalysisPipeline onComplete={() => nav('/screening/result')} />
      </div>
    </>
  );
}
""")

write_file("src/pages/ResultPage.tsx", """
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, GradeBadge, Button, Badge } from '../components';
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
      <Stepper active={5} />
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
      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => nav('/screening/explain')}>View Explainability</Button>
        {isDoctor && <Button onClick={() => nav('/screening/review')}>Perform Review</Button>}
        {!isDoctor && <Button onClick={() => nav('/screening/report')}>Generate Report</Button>}
      </div>
    </>
  );
}
""")

write_file("src/pages/ExplainPage.tsx", """
import React, { useState } from 'react';
import { SectionHeader, Stepper, Card } from '../components';
import { GradCAMViewer } from '../components/GradCAMViewer';
import { VesselOverlay } from '../components/VesselOverlay';
import { ODFoveaMarker } from '../components/ODFoveaMarker';
import { LesionPanel } from '../components/LesionPanel';
import { useScreening } from '../contexts/ScreeningContext';

export default function ExplainPage() {
  const { screening } = useScreening();
  const [activeEye, setActiveEye] = useState<'left'|'right'>('left');
  
  const eyeData = activeEye === 'left' ? screening.result?.left_eye : screening.result?.right_eye;

  return (
    <>
      <SectionHeader title="Explainability" />
      <Stepper active={5} />
      
      <div className="eye-tabs" style={{ margin: '24px 0' }}>
        <button className={activeEye === 'left' ? 'active' : ''} onClick={() => setActiveEye('left')}>Left Eye</button>
        <button className={activeEye === 'right' ? 'active' : ''} onClick={() => setActiveEye('right')}>Right Eye</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <Card>
          <h3>Model Focus (Grad-CAM)</h3>
          {eyeData ? (
            <GradCAMViewer originalUrl={`http://localhost:8000/static/results/${eyeData.gradcam_url}`} gradcamUrl={`http://localhost:8000/static/results/${eyeData.gradcam_url}`} />
          ) : <div>No data</div>}
        </Card>
        <Card>
          <h3>Vessel Segmentation</h3>
          {eyeData ? (
            <VesselOverlay originalUrl={`http://localhost:8000/static/results/${eyeData.gradcam_url}`} vesselUrl={`http://localhost:8000/static/results/${eyeData.vessel_overlay_url}`} />
          ) : <div>No data</div>}
        </Card>
        <Card>
          <h3>OD / Fovea Landmark</h3>
          {eyeData ? (
            <ODFoveaMarker originalUrl={`http://localhost:8000/static/results/${eyeData.gradcam_url}`} overlayUrl={`http://localhost:8000/static/results/${eyeData.od_fovea_overlay_url}`} />
          ) : <div>No data</div>}
        </Card>
        <Card>
          <h3>Lesion Analysis</h3>
          <LesionPanel lesion={eyeData?.lesion || null} />
        </Card>
      </div>
    </>
  );
}
""")

write_file("src/pages/ReviewPage.tsx", """
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { submitReview } from '../services/review';

export default function ReviewPage() {
  const { screening } = useScreening();
  const nav = useNavigate();
  const [notes, setNotes] = useState('');
  
  const handleReview = async (decision: string) => {
    if (!screening.screeningId) return;
    try {
      await submitReview(screening.screeningId, { decision, notes });
      nav('/screening/report');
    } catch (err) {
      alert('Review failed');
    }
  };

  return (
    <>
      <SectionHeader title="Human Review" />
      <Stepper active={6} />
      <Card style={{ marginTop: 24 }}>
        <h3>Clinical Decision</h3>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Clinical notes..." style={{ width: '100%', minHeight: 100, marginTop: 16, padding: 12 }} />
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={() => handleReview('confirmed')}>Confirm AI Grade</Button>
          <Button variant="secondary" onClick={() => handleReview('modified')}>Modify Grade</Button>
          <Button variant="danger" onClick={() => handleReview('flagged')}>Flag for Specialist</Button>
        </div>
      </Card>
    </>
  );
}
""")

write_file("src/pages/ReportPage.tsx", """
import React from 'react';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { getReportPdfUrl } from '../services/reports';

export default function ReportPage() {
  const { screening } = useScreening();

  return (
    <>
      <SectionHeader title="Final Report" />
      <Stepper active={7} />
      <Card style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ marginBottom: 24 }}>Report Ready</h2>
        {screening.screeningId && (
          <div style={{ display: 'flex', gap: 12 }}>
            <Button onClick={() => window.open(getReportPdfUrl(screening.screeningId as string), '_blank')}>Download PDF</Button>
            <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          </div>
        )}
      </Card>
    </>
  );
}
""")

write_file("src/pages/ReviewQueuePage.tsx", """
import React, { useEffect, useState } from 'react';
import { SectionHeader, Card } from '../components';
import { ReviewQueueTable } from '../components/ReviewQueueTable';
import { getReviewQueue } from '../services/review';
import { ScreeningResult } from '../types';

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<ScreeningResult[]>([]);
  
  useEffect(() => {
    getReviewQueue().then(setQueue).catch(console.error);
  }, []);

  return (
    <>
      <SectionHeader title="Review Queue" description="Prioritized list of screenings requiring doctor verification." />
      <Card>
        <ReviewQueueTable screenings={queue} />
      </Card>
    </>
  );
}
""")

# Placeholders for others
for p in ['PatientsPage', 'PatientDetailPage', 'HistoryPage', 'AnalyticsPage', 'SystemStatusPage', 'SettingsPage', 'ReportsListPage']:
    write_file(f"src/pages/{p}.tsx", f"""
import React from 'react';
import {{ SectionHeader }} from '../components';
export default function {p}() {{
  return <><SectionHeader title="{p.replace('Page', '')}" /><div style={{padding: 24}}>Coming soon</div></>;
}}
""")
