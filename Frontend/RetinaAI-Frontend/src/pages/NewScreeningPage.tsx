import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SectionHeader, Card, Button, Stepper } from '../components';
import { createPatient, getPatient } from '../services/patients';
import { createScreening } from '../services/screenings';
import { useScreening } from '../contexts/ScreeningContext';
import { Activity, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function NewScreeningPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get('patientId') || searchParams.get('patient_id');

  // Mode 2: Existing Patient (Longitudinal Follow-up) State
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const [patientLoading, setPatientLoading] = useState(Boolean(patientIdParam));
  const [patientError, setPatientError] = useState<string | null>(null);

  // Mode 1: New Patient Form State
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    sex: 'M',
    diabetes_duration: '',
    hba1c: '',
    previous_dr: 'None',
  });
  const [loading, setLoading] = useState(false);
  const { setPatient, setScreeningId, reset } = useScreening();
  const nav = useNavigate();

  // Load existing patient when patientId parameter is present
  useEffect(() => {
    if (!patientIdParam) return;
    setPatientLoading(true);
    setPatientError(null);
    getPatient(patientIdParam)
      .then(p => {
        if (p) {
          setExistingPatient(p);
        } else {
          setPatientError("Patient information is missing. Please return to the patient profile and start the longitudinal screening from there.");
        }
      })
      .catch(err => {
        console.error('Failed to load patient:', err);
        setPatientError("Patient information is missing or could not be retrieved. Please return to the patient profile and start the longitudinal screening from there.");
      })
      .finally(() => setPatientLoading(false));
  }, [patientIdParam]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData(f => ({ ...f, [key]: e.target.value }));

  // Handler for Mode 1: Register New Patient and start screening
  const handleNewPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const patient = await createPatient({
        ...formData,
        age: Number(formData.age),
        diabetes_duration: Number(formData.diabetes_duration),
      });
      const screening = await createScreening(patient.id);
      reset();
      setPatient(patient.id, patient.name, {
        patientDisplayId: patient.patient_display_id,
        isFollowUp: false
      });
      setScreeningId(screening.screening_id || screening.id);
      nav('/screening/capture');
    } catch (err) {
      console.error(err);
      alert('Error creating screening');
    } finally {
      setLoading(false);
    }
  };

  // Handler for Mode 2: Longitudinal Follow-up for Existing Patient (NO duplicate patient created!)
  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingPatient) return;
    setLoading(true);
    try {
      // Find latest previous screening to link as previous_screening_id
      const prevScr = existingPatient.screenings && existingPatient.screenings.length > 0
        ? existingPatient.screenings[0]
        : existingPatient.latest_screening;
      const prevId = prevScr?.id || prevScr?.screening_id || null;

      const screening = await createScreening(existingPatient.id, prevId);
      reset();
      
      const prevDateStr = prevScr?.created_at
        ? new Date(prevScr.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Baseline';
      const prevGradeStr = prevScr?.left_eye?.dr_grade_name || prevScr?.dr_grade_name || 'Recorded';

      setPatient(existingPatient.id, existingPatient.name, {
        patientDisplayId: existingPatient.patient_display_id || existingPatient.patientId || existingPatient.id,
        isFollowUp: true,
        previousExamDate: prevDateStr,
        previousExamGrade: prevGradeStr
      });
      setScreeningId(screening.screening_id || screening.id);
      nav('/screening/capture');
    } catch (err) {
      console.error(err);
      alert('Error creating longitudinal screening session');
    } finally {
      setLoading(false);
    }
  };

  // Error State for Mode 2
  if (patientIdParam && patientError) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#feebe8', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={28} color="#dc2626" />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#183639', marginBottom: 8 }}>
          Patient Context Missing
        </h2>
        <p style={{ color: '#688285', fontSize: 13.5, lineHeight: 1.5, marginBottom: 24 }}>
          {patientError}
        </p>
        <Button onClick={() => nav('/patients')} style={{ background: '#0e6264', color: '#fff' }}>
          <ArrowLeft size={16} /> Return to Patient Directory
        </Button>
      </div>
    );
  }

  // Loading State for Mode 2
  if (patientIdParam && patientLoading) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', color: '#688285' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e2eceb', borderTop: '3px solid #0e6264', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#132b2e' }}>Loading Patient Profile…</h3>
        <p style={{ fontSize: 13 }}>Preparing longitudinal examination context for {patientIdParam}.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 2: LONGITUDINAL FOLLOW-UP FOR EXISTING PATIENT
  // ─────────────────────────────────────────────────────────────────────────────
  if (existingPatient) {
    const prevScr = existingPatient.screenings && existingPatient.screenings.length > 0
      ? existingPatient.screenings[0]
      : existingPatient.latest_screening;

    const prevDateFormatted = prevScr?.created_at
      ? `${new Date(prevScr.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • ${new Date(prevScr.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
      : 'No prior screening date';

    const prevGrade = prevScr?.left_eye?.dr_grade !== undefined
      ? `Grade ${prevScr.left_eye.dr_grade} (${prevScr.left_eye.dr_grade_name || 'Graded'})`
      : prevScr?.dr_grade_name || 'Baseline record';

    const examNumber = (existingPatient.screenings?.length || (existingPatient.latest_screening ? 1 : 0)) + 1;
    const isSecondScreening = examNumber === 2;

    return (
      <>
        <SectionHeader 
          title={isSecondScreening ? "Second Longitudinal Screening" : `Longitudinal Examination (Exam ${examNumber})`} 
        />
        <Stepper active={1} />
        
        <Card style={{ maxWidth: 680, margin: '0 auto', marginTop: 24, padding: 28 }}>
          {/* Clinical Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#e0f2fe',
            border: '1px solid #bae6fd',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 20
          }}>
            <Activity size={22} color="#0284c7" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Existing Patient Context Verified
              </div>
              <div style={{ fontSize: 13.5, color: '#0c4a6e', fontWeight: 600, marginTop: 2 }}>
                Patient ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{existingPatient.patient_display_id || existingPatient.id}</span> · {existingPatient.name}
              </div>
            </div>
          </div>

          <form onSubmit={handleFollowUpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* Examination Comparison Metadata Card */}
            <div style={{ background: '#f8faf9', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#688285', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Longitudinal Tracking Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                  <div style={{ fontSize: 11, color: '#688285' }}>Current Session Type</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0e6264', marginTop: 2 }}>
                    {isSecondScreening ? 'Examination 2 (Follow-up)' : `Examination ${examNumber} (Follow-up)`}
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                  <div style={{ fontSize: 11, color: '#688285' }}>Previous Examination</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
                    {prevDateFormatted}
                  </div>
                </div>
              </div>
              {prevScr && (
                <div style={{ marginTop: 10, background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                  <div style={{ fontSize: 11, color: '#688285' }}>Prior Examination DR Result</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
                    {prevGrade}
                  </div>
                </div>
              )}
            </div>

            {/* Read-Only Patient Clinical Details (No duplication!) */}
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#688285', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Patient Demographic &amp; Diabetes Baseline
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 11.5, color: '#688285' }}>Full Name</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
                    {existingPatient.name}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11.5, color: '#688285' }}>Demographics</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
                    {existingPatient.age} yrs · {existingPatient.sex === 'M' ? 'Male' : existingPatient.sex === 'F' ? 'Female' : existingPatient.sex}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11.5, color: '#688285' }}>Diabetes Duration</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
                    {existingPatient.diabetes_duration} years
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11.5, color: '#688285' }}>HbA1c Biomarker</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
                    {existingPatient.hba1c || 'Not recorded'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, color: '#065f46', lineHeight: 1.4 }}>
                <strong>No re-registration required.</strong> This follow-up examination will be recorded under existing patient ID <strong>{existingPatient.patient_display_id || existingPatient.id}</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => nav(`/patients/${existingPatient.id}`)}
              >
                <ArrowLeft size={15} /> Cancel &amp; Back to Profile
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                style={{ background: '#0e6264', color: '#fff', padding: '10px 22px', fontSize: 13.5, fontWeight: 700 }}
              >
                {loading ? 'Creating Examination…' : 'Proceed to Image Capture →'}
              </Button>
            </div>
          </form>
        </Card>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 1: REGISTER NEW PATIENT / NORMAL SCREENING FLOW (Preserved 100% untouched)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <SectionHeader title="New Screening" />
      <Stepper active={1} />
      <Card style={{ maxWidth: 600, margin: '0 auto', marginTop: 32 }}>
        <h3>Patient Details</h3>
        <form onSubmit={handleNewPatientSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <label className="field">
            Full Name
            <input required value={formData.name} onChange={set('name')} placeholder="e.g. Ramesh Kumar" />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label className="field">
              Age (years)
              <input required type="number" min={1} max={120} value={formData.age} onChange={set('age')} placeholder="e.g. 52" />
            </label>
            <label className="field">
              Sex
              <select value={formData.sex} onChange={set('sex')}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label className="field">
              Diabetes Duration (years)
              <input required type="number" min={0} max={80} value={formData.diabetes_duration} onChange={set('diabetes_duration')} placeholder="e.g. 7" />
            </label>
            <label className="field">
              HbA1c (%) <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span>
              <input type="text" value={formData.hba1c} onChange={set('hba1c')} placeholder="e.g. 8.2" />
            </label>
          </div>

          <label className="field">
            Previous DR Diagnosis
            <select value={formData.previous_dr} onChange={set('previous_dr')}>
              <option value="None">None</option>
              <option value="Mild NPDR">Mild NPDR</option>
              <option value="Moderate NPDR">Moderate NPDR</option>
              <option value="Severe NPDR">Severe NPDR</option>
              <option value="Proliferative DR">Proliferative DR</option>
              <option value="Unknown">Unknown</option>
            </select>
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button variant="secondary" onClick={() => nav('/')}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Starting...' : 'Next: Image Capture →'}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
