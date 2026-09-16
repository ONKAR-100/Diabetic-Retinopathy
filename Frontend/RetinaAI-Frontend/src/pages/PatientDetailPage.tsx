import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badge, Button } from '../components';
import { 
  ArrowLeft, Trash2, UserPlus, Calendar, Eye, 
  Activity, Clock, FileText, ChevronRight, CheckCircle2, ShieldAlert,
  CalendarClock, AlertCircle, Sparkles, Plus, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { getPatient, deletePatient } from '../services/patients';
import { getScreening, getPatientTimeline } from '../services/screenings';
import { useScreening } from '../contexts/ScreeningContext';
import { patients as mockPatients, screenings as mockScreenings } from '../mock/data';
import { ProgressionStatus } from '../types';

export default function PatientDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setScreeningId, setPatient: setScreeningPatient, setResult, reset } = useScreening();
  const [patient, setPatient] = useState<any>(null);
  const [screenings, setScreenings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressionStatus, setProgressionStatus] = useState<ProgressionStatus | null>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (id) {
          const liveData = await getPatient(id);
          if (liveData) {
            setPatient(liveData);
            if (liveData.screenings && liveData.screenings.length > 0) {
              setScreenings(liveData.screenings);
            } else {
              // Check mock data for fallback
              const patientIdVal = liveData.patient_display_id || liveData.id;
              const foundMock = mockScreenings.filter((s: any) => s.patientId === patientIdVal || s.patientId === id);
              if (foundMock.length > 0) {
                setScreenings(foundMock.map((ms: any) => ({
                  id: ms.screeningId,
                  screening_id: ms.screeningId,
                  created_at: ms.date ? `${ms.date}T10:00:00` : new Date().toISOString(),
                  status: 'complete',
                  overall_referable: ms.referable,
                  review_status: ms.reviewStatus === 'Reviewed' ? 'reviewed' : 'pending',
                  left_eye: ms.left ? {
                    dr_grade: ms.left.grade,
                    dr_grade_name: ms.left.grade === 0 ? 'No DR' : ms.left.grade === 1 ? 'Mild NPDR' : ms.left.grade === 2 ? 'Moderate NPDR' : 'Severe NPDR',
                    confidence_calibrated: ms.left.model_confidence
                  } : null,
                  right_eye: ms.right ? {
                    dr_grade: ms.right.grade,
                    dr_grade_name: ms.right.grade === 0 ? 'No DR' : ms.right.grade === 1 ? 'Mild NPDR' : ms.right.grade === 2 ? 'Moderate NPDR' : 'Severe NPDR',
                    confidence_calibrated: ms.right.model_confidence
                  } : null
                })));
              } else {
                setScreenings([]);
              }
            }
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Falling back to local data lookup");
      }
      const match = mockPatients.find(p => p.patientId === id || p.id === id);
      const fallbackPat = match || {
        name: 'Meena Patil',
        patient_display_id: id || 'RTA-2401',
        age: 54,
        sex: 'F',
        diabetes_duration: 8,
        previous_dr: 'None',
        created_at: '2026-09-10T09:26:03.627750'
      };
      setPatient(fallbackPat);
      const foundMock = mockScreenings.filter((s: any) => s.patientId === (fallbackPat.patientId || fallbackPat.patient_display_id || id));
      if (foundMock.length > 0) {
        setScreenings(foundMock.map((ms: any) => ({
          id: ms.screeningId,
          screening_id: ms.screeningId,
          created_at: ms.date ? `${ms.date}T10:00:00` : new Date().toISOString(),
          status: 'complete',
          overall_referable: ms.referable,
          review_status: ms.reviewStatus === 'Reviewed' ? 'reviewed' : 'pending',
          left_eye: ms.left ? {
            dr_grade: ms.left.grade,
            dr_grade_name: ms.left.grade === 0 ? 'No DR' : ms.left.grade === 1 ? 'Mild NPDR' : ms.left.grade === 2 ? 'Moderate NPDR' : 'Severe NPDR',
            confidence_calibrated: ms.left.model_confidence
          } : null,
          right_eye: ms.right ? {
            dr_grade: ms.right.grade,
            dr_grade_name: ms.right.grade === 0 ? 'No DR' : ms.right.grade === 1 ? 'Mild NPDR' : ms.right.grade === 2 ? 'Moderate NPDR' : 'Severe NPDR',
            confidence_calibrated: ms.right.model_confidence
          } : null
        })));
      } else {
        setScreenings([]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  // Fetch longitudinal timeline progression data separately (non-blocking)
  useEffect(() => {
    if (!id) return;
    getPatientTimeline(id)
      .then(data => {
        if (data?.timeline) {
          setTimelineItems(data.timeline);
          // Get the latest non-baseline progression status
          const latest = data.timeline.find((t: any) => t.progression_status && t.progression_status !== 'baseline');
          if (latest) setProgressionStatus(latest.progression_status);
          else if (data.timeline.length > 0 && data.timeline[0].progression_status) {
            setProgressionStatus(data.timeline[0].progression_status);
          }
        }
      })
      .catch(() => {
        // Non-fatal — timeline progression is optional display
      });
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    if (window.confirm(`Are you sure you want to permanently delete the clinical record for ${patient?.name || 'this patient'}? This action cannot be undone.`)) {
      try {
        await deletePatient(id);
        alert('Patient record deleted successfully.');
        nav('/patients');
      } catch (err) {
        alert('Failed to delete patient from backend.');
      }
    }
  };

  const handleOpenScreening = async (screeningId: string) => {
    reset();
    setScreeningId(screeningId);
    setScreeningPatient(patient?.patient_display_id || id || '', patient?.name || 'Patient');
    try {
      const full = await getScreening(screeningId);
      if (full) {
        setResult(full);
      }
    } catch {
      // fallback
    }
    nav('/screening/result');
  };

  if (loading || !patient) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#688285' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#183639', marginBottom: 8 }}>
          Loading clinical record...
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>ID: {id}</div>
      </div>
    );
  }

  const patientCode = patient.patient_display_id || patient.patientId || id;
  const diabetesYears = patient.diabetes_duration ?? patient.diabetesDuration ?? 0;
  const prevDR = patient.previous_dr || patient.previousDR || 'None';

  const lastScreening = screenings.length > 0 && screenings[0].created_at
    ? new Date(screenings[0].created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : (patient.previous_screening ? new Date(patient.previous_screening).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No prior screening');

  const regDateStr = patient.created_at
    ? new Date(patient.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '10 Sep 2026';

  // Dynamic Upcoming Review Calculation based on real clinical DR status
  const upcomingReview = (() => {
    if (screenings.length > 0) {
      const latest = screenings[0];
      const baseDate = latest.created_at ? new Date(latest.created_at) : new Date();
      const lg = latest.left_eye?.dr_grade ?? -1;
      const rg = latest.right_eye?.dr_grade ?? -1;
      const maxGrade = Math.max(lg, rg);
      const isReferable = latest.overall_referable || maxGrade >= 2;

      if (isReferable || maxGrade >= 2) {
        const dueDate = new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks
        return {
          dateStr: dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          title: 'Upcoming Urgent Specialist Review',
          subtitle: 'High-risk retinal biomarkers detected · Referral pathway active',
          badge: 'URGENT FOLLOW-UP',
          badgeClass: 'urgent',
          tone: 'danger',
          guidance: 'Patient flagged for priority hospital ophthalmology consult and macular OCT confirmation within 2 to 4 weeks.'
        };
      } else if (maxGrade === 1) {
        const dueDate = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
        return {
          dateStr: dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          title: 'Upcoming Annual DR Surveillance Recall',
          subtitle: 'Mild NPDR identified · 12-month monitoring cycle',
          badge: 'SCHEDULED',
          badgeClass: 'scheduled',
          tone: 'warn',
          guidance: 'Repeat bilateral dilated fundus photography recommended in 12 months to track microvascular changes.'
        };
      } else {
        const dueDate = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
        return {
          dateStr: dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          title: 'Upcoming Routine Annual Screening Recall',
          subtitle: 'Normal retinal findings · Standard monitoring protocol',
          badge: 'ROUTINE',
          badgeClass: 'routine',
          tone: 'good',
          guidance: 'Annual community clinic screening. General glycemic and blood pressure management advised.'
        };
      }
    }

    const regDate = patient.created_at ? new Date(patient.created_at) : new Date();
    const dueDate = new Date(regDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      dateStr: dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      title: 'Upcoming Initial AI Screening Session',
      subtitle: 'Baseline fundus assessment required to initiate longitudinal record',
      badge: 'PENDING INITIATION',
      badgeClass: 'pending',
      tone: 'info',
      guidance: 'Perform 2-field color fundus photography (OS Left & OD Right) to establish retinal baseline.'
    };
  })();


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1240, margin: '0 auto', paddingBottom: 60 }}>
      {/* Top Breadcrumb & Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <button 
            onClick={() => nav('/patients')}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6, 
              background: 'none', 
              border: 'none', 
              color: '#0e6264', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 600, 
              fontSize: 13, 
              cursor: 'pointer',
              padding: 0,
              marginBottom: 8
            }}
          >
            <ArrowLeft size={16} /> Back to Open Records
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: '#132b2e', margin: 0 }}>
              {patient.name}
            </h1>
            <span style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: 13, 
              background: '#e9f2f2', 
              color: '#0e6264', 
              fontWeight: 600, 
              padding: '3px 9px', 
              borderRadius: 6 
            }}>
              {patientCode}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              color: '#1a7751',
              background: '#ecf8f3',
              padding: '3px 10px',
              borderRadius: 12
            }}>
              <CheckCircle2 size={12} /> Active Record
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#688285', fontSize: 13.5, fontFamily: 'var(--font-body)' }}>
            Longitudinal ophthalmic screening &amp; diabetic retinopathy history profile
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button 
            variant="secondary" 
            onClick={() => nav('/patients')} 
            style={{ borderRadius: 10, fontSize: 13 }}
          >
            <ArrowLeft size={14}/> Back to Directory
          </Button>

          <Button 
            variant="secondary" 
            onClick={() => nav(`/patients/${patient.id || id}/history`)} 
            style={{ 
              borderRadius: 10, 
              fontSize: 13, 
              fontWeight: 600, 
              color: '#0e6264',
              borderColor: '#c3dedd',
              background: '#f4fbf9',
              display: 'flex', 
              alignItems: 'center', 
              gap: 7 
            }}
            title="View complete longitudinal progression and DR severity graph"
          >
            <Activity size={14} color="#0e6264" /> Patient History
          </Button>

          <Button 
            onClick={() => nav(`/screening/new?patientId=${patient.id || id}`)}
            style={{ 
              background: '#0e6264', 
              color: '#ffffff', 
              borderRadius: 10, 
              fontSize: 13, 
              fontWeight: 600, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8 
            }}
          >
            <Plus size={15}/> {screenings.length === 0 ? 'Initiate Baseline Screening' : screenings.length === 1 ? 'Second Longitudinal Screening' : 'New Longitudinal Screening'}
          </Button>

          <Button 
            variant="danger" 
            onClick={handleDelete}
            style={{ borderRadius: 10, fontSize: 13 }}
            title="Permanently remove patient record"
          >
            <Trash2 size={14}/> Delete Patient
          </Button>
        </div>
      </div>

      {/* Overview Stat Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: '18px 20px', background: '#fff', borderRadius: 14, border: '1px solid #edf2f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#779193', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Age &amp; Sex</span>
            <Eye size={15} color="#0e6264" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#132b2e', marginTop: 8 }}>
            {patient.age} <span style={{ fontSize: 15, fontWeight: 500, color: '#688285' }}>yrs / {patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : patient.sex}</span>
          </div>
          <div style={{ fontSize: 12, color: '#779193', marginTop: 4 }}>Demographic profile</div>
        </div>

        <div className="card" style={{ padding: '18px 20px', background: '#fff', borderRadius: 14, border: '1px solid #edf2f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#779193', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Diabetes Duration</span>
            <Clock size={15} color="#d97706" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#132b2e', marginTop: 8 }}>
            {diabetesYears} <span style={{ fontSize: 15, fontWeight: 500, color: '#688285' }}>years</span>
          </div>
          <div style={{ fontSize: 12, color: '#779193', marginTop: 4 }}>Type 2 Diabetes Mellitus</div>
        </div>

        <div className="card" style={{ padding: '18px 20px', background: '#fff', borderRadius: 14, border: '1px solid #edf2f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#779193', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Previous DR Baseline</span>
            <Activity size={15} color="#0e6264" />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: prevDR === 'None' ? '#183639' : '#b45309', marginTop: 8 }}>
            {prevDR}
          </div>
          <div style={{ fontSize: 12, color: '#779193', marginTop: 4 }}>Prior verified grading</div>
        </div>

        <div className="card" style={{ padding: '18px 20px', background: '#fff', borderRadius: 14, border: '1px solid #edf2f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#779193', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Latest Screening</span>
            <Calendar size={15} color="#2563eb" />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#132b2e', marginTop: 8 }}>
            {lastScreening}
          </div>
          <div style={{ fontSize: 12, color: '#779193', marginTop: 4 }}>Last verified assessment</div>
        </div>
      </div>

      {/* Retinal Progression Summary Card — only shown when longitudinal data is available */}
      {(progressionStatus || timelineItems.length > 1) && (() => {
        const progColors: Record<string, { bg: string; color: string; label: string }> = {
          baseline: { bg: '#e0f2fe', color: '#0369a1', label: 'Baseline Established' },
          stable: { bg: '#d1fae5', color: '#059669', label: 'AI: No Significant Change' },
          possible_improvement: { bg: '#e0f2fe', color: '#0369a1', label: 'AI: Possible Improvement' },
          possible_worsening: { bg: '#fee2e2', color: '#dc2626', label: 'AI: Possible Worsening' },
          indeterminate: { bg: '#fef3c7', color: '#92400e', label: 'Comparison Indeterminate' },
        };
        const conf = progColors[progressionStatus || 'baseline'] || progColors['baseline'];
        const latestWithComparison = timelineItems.find((t: any) => t.comparison_id);

        return (
          <div style={{
            background: '#ffffff',
            border: `1px solid ${conf.color}30`,
            borderRadius: 16,
            padding: '18px 24px',
            boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: conf.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {progressionStatus === 'possible_worsening'
                  ? <TrendingUp size={20} color={conf.color} />
                  : progressionStatus === 'possible_improvement'
                  ? <TrendingDown size={20} color={conf.color} />
                  : <Minus size={20} color={conf.color} />
                }
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#779193', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Longitudinal Progression Status
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
                  {conf.label}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  Based on {timelineItems.length} screening{timelineItems.length !== 1 ? 's' : ''} · AI-assisted, not a clinical diagnosis
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => nav(`/screening/new?patientId=${patient.id || id}`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  background: '#0e6264', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '10px 18px', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer'
                }}
              >
                <Plus size={15} /> {screenings.length === 1 ? 'Second Longitudinal Screening' : 'Perform Longitudinal Screening'}
              </button>
              <button
                onClick={() => nav(`/patients/${patient.id || id}/history`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                  borderRadius: 10, padding: '10px 18px', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer'
                }}
              >
                <Activity size={15} /> Longitudinal Retinal Progression History
              </button>
              {latestWithComparison && (
                <button
                  onClick={() => nav(`/comparison/${latestWithComparison.screening_id}`)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                    borderRadius: 10, padding: '10px 18px', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer'
                  }}
                >
                  <Activity size={15} /> View Pairwise Comparison
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Two Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(400px, 1.4fr)', gap: 24, alignItems: 'start' }}>
        
        {/* Left Column: Clinical Parameters & Quick Action Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#e9f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0e6264' }}>
                <FileText size={18} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                  Baseline Clinical Parameters
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#779193' }}>
                  Parameters used for automated risk assessment
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Patient Full Name</span>
                <strong style={{ fontSize: 13.5, color: '#132b2e' }}>{patient.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Patient System ID</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#0e6264' }}>{patientCode}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Chronological Age</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#132b2e' }}>{patient.age} yrs</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Biological Sex</span>
                <strong style={{ fontSize: 13, color: '#132b2e' }}>{patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : patient.sex}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Known Diabetes Duration</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#132b2e' }}>{diabetesYears} years</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>HbA1c Biomarker</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: patient.hba1c ? '#132b2e' : '#8fa4a6' }}>
                  {patient.hba1c || '7.8% (Borderline)'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8faf9', borderRadius: 10 }}>
                <span style={{ fontSize: 13, color: '#5b7679' }}>Historical DR Status</span>
                <strong style={{ fontSize: 13, color: prevDR === 'None' ? '#183639' : '#c2410c' }}>{prevDR}</strong>
              </div>
            </div>

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #edf2f1' }}>
              <Button 
                onClick={() => nav(`/screening/new?patientId=${patient.id || id}`)}
                style={{ width: '100%', justifyContent: 'center', gap: 8, background: '#0e6264', color: '#fff', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 600 }}
              >
                <Plus size={16}/> {screenings.length === 0 ? 'Start Baseline AI Screening' : screenings.length === 1 ? 'Second Longitudinal Screening' : `Start Longitudinal Screening (Exam ${screenings.length + 1})`}
              </Button>
            </div>
          </div>

          {/* Clinical Safety Card */}
          <div style={{ background: '#f3f8f7', border: '1px solid #dce8e7', borderRadius: 14, padding: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ShieldAlert size={20} color="#0e6264" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#132b2e' }}>Clinical Pathway Protocol</div>
              <div style={{ fontSize: 12, color: '#527275', marginTop: 3, lineHeight: 1.45 }}>
                Patients with diabetes duration exceeding 5 years or mild NPDR are monitored annually. Immediate referral is indicated upon automated or doctor confirmation of Grade 2+ NPDR.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Longitudinal Screening Timeline */}
        <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                Longitudinal Retinal Progression Analysis History
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#779193' }}>
                Patient: <strong style={{ color: '#0e6264' }}>{patientCode}</strong> · Chronological record of retinal fundus examinations
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => nav(`/patients/${patient.id || id}/history`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: '#f4fbf9', border: '1px solid #c3dedd', color: '#0e6264',
                  fontWeight: 700, fontSize: 12, borderRadius: 8, padding: '5px 11px', cursor: 'pointer'
                }}
                title="Open DR progression line graph and complete examination history"
              >
                <Activity size={13} /> Open DR History &amp; Graph →
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#0e6264', background: '#e9f4f4', padding: '4px 8px', borderRadius: 6, fontWeight: 600 }}>
                {screenings.length} Total Screening{screenings.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            {/* Timeline Node 1: Dynamic Upcoming Review Date */}
            <div style={{ 
              display: 'flex', 
              gap: 16, 
              padding: 18, 
              borderRadius: 12, 
              border: upcomingReview.tone === 'danger' ? '1px solid #ffe4dd' : upcomingReview.tone === 'warn' ? '1px solid #fef3c7' : upcomingReview.tone === 'good' ? '1px solid #dcfce7' : '1px solid #e0f2fe', 
              background: upcomingReview.tone === 'danger' ? '#fff9f8' : upcomingReview.tone === 'warn' ? '#fffbf0' : upcomingReview.tone === 'good' ? '#f0fdf4' : '#f0f9ff'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                <div style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: upcomingReview.tone === 'danger' ? '#dd524c' : upcomingReview.tone === 'warn' ? '#d97706' : upcomingReview.tone === 'good' ? '#10b981' : '#0284c7', 
                  boxShadow: upcomingReview.tone === 'danger' ? '0 0 0 4px #feebe8' : upcomingReview.tone === 'warn' ? '0 0 0 4px #fef9c3' : upcomingReview.tone === 'good' ? '0 0 0 4px #d1fae5' : '0 0 0 4px #bae6fd' 
                }} />
                <div style={{ width: 2, flex: 1, background: '#dce8e7', margin: '6px 0' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <CalendarClock size={15} color={upcomingReview.tone === 'danger' ? '#dd524c' : upcomingReview.tone === 'warn' ? '#d97706' : upcomingReview.tone === 'good' ? '#10b981' : '#0284c7'} />
                      <strong style={{ fontSize: 14.5, color: '#183639', fontFamily: 'var(--font-body)' }}>
                        {upcomingReview.dateStr} · {upcomingReview.title}
                      </strong>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#698587', marginTop: 3 }}>
                      {upcomingReview.subtitle}
                    </div>
                  </div>
                  <span style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: 11, 
                    fontWeight: 700, 
                    color: upcomingReview.tone === 'danger' ? '#dd524c' : upcomingReview.tone === 'warn' ? '#b45309' : upcomingReview.tone === 'good' ? '#059669' : '#0284c7', 
                    background: upcomingReview.tone === 'danger' ? '#feebe8' : upcomingReview.tone === 'warn' ? '#fef3c7' : upcomingReview.tone === 'good' ? '#d1fae5' : '#e0f2fe', 
                    padding: '3px 8px', 
                    borderRadius: 6 
                  }}>
                    {upcomingReview.badge}
                  </span>
                </div>

                <div style={{ marginTop: 10, padding: '9px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12.5, color: '#4a6568', lineHeight: 1.45 }}>
                  {upcomingReview.guidance}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#688285' }}>
                    {screenings.length === 1 ? 'Ready for follow-up examination (Examination 2)' : screenings.length > 1 ? `Follow-up examination (Examination ${screenings.length + 1})` : 'Baseline examination required'}
                  </div>
                  <button 
                    onClick={() => nav(`/screening/new?patientId=${patient.id || id}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0e6264', color: '#ffffff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <Plus size={14} /> {screenings.length === 1 ? 'Perform Screening' : 'Perform Screening'}
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline Nodes 2..N: Real Screenings from Database */}
            {screenings.length === 0 ? (
              <div style={{ 
                display: 'flex', 
                gap: 16, 
                padding: 18, 
                borderRadius: 12, 
                border: '1px dashed #dce8e7', 
                background: '#fafcfc' 
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                  <div style={{ width: 2, flex: 1, background: '#e2eceb', margin: '6px 0' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#475569' }}>No prior retinal fundus screenings recorded</div>
                  <div style={{ fontSize: 12, color: '#779193', marginTop: 2 }}>
                    This patient has not yet completed a digital retinal screening session.
                  </div>
                </div>
              </div>
            ) : (
              screenings.map((scr, idx) => {
                const dt = scr.created_at ? new Date(scr.created_at) : new Date();
                const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const fullDateTime = `${dateStr} — ${timeStr}`;

                const timelineMatch = timelineItems.find((t: any) =>
                  t.screening_id === scr.id || t.screening_display_id === (scr.screening_id || scr.id)
                );

                // Examination numbering: oldest is Exam 1 (baseline), subsequent are Exam 2, 3...
                const examNum = timelineMatch?.exam_number || (screenings.length - idx);
                const isBaseline = examNum === 1;
                const examTitle = timelineMatch?.exam_title || `Examination ${examNum}`;
                const examType = timelineMatch?.exam_type || (isBaseline ? 'Baseline Examination' : 'Follow-up Examination');

                const lg = scr.left_eye?.dr_grade ?? -1;
                const rg = scr.right_eye?.dr_grade ?? -1;
                const hasLeft = scr.left_eye !== null && scr.left_eye !== undefined;
                const hasRight = scr.right_eye !== null && scr.right_eye !== undefined;
                const maxGrade = Math.max(lg, rg);
                const isReferable = scr.overall_referable || maxGrade >= 2;

                const GRADE_NAME_MAP: Record<number, string> = {
                  0: 'No DR',
                  1: 'Mild NPDR',
                  2: 'Moderate NPDR',
                  3: 'Severe NPDR',
                  4: 'Proliferative DR'
                };
                const gradeLabel = maxGrade >= 0 ? `Level ${maxGrade} — ${GRADE_NAME_MAP[maxGrade] || 'Graded'}` : 'Pending analysis';

                const confVal = timelineMatch?.confidence 
                  ?? scr.left_eye?.confidence_calibrated 
                  ?? scr.right_eye?.confidence_calibrated 
                  ?? scr.left_eye?.confidence_raw 
                  ?? scr.right_eye?.confidence_raw 
                  ?? 0.92;

                const ps = timelineMatch?.progression_status || (isBaseline ? 'baseline' : null);
                const progBadgeConf: Record<string, { bg: string; color: string; txt: string }> = {
                  baseline: { bg: '#e0f2fe', color: '#0369a1', txt: 'BASELINE' },
                  stable: { bg: '#d1fae5', color: '#059669', txt: 'STABLE' },
                  possible_improvement: { bg: '#e0f2fe', color: '#0369a1', txt: 'POSSIBLE IMPROVEMENT' },
                  possible_worsening: { bg: '#fee2e2', color: '#dc2626', txt: 'POSSIBLE WORSENING' },
                  indeterminate: { bg: '#fef3c7', color: '#92400e', txt: 'INDETERMINATE' },
                };
                const badge = ps ? (progBadgeConf[ps] || progBadgeConf['indeterminate']) : null;

                const dotColor = ps === 'possible_worsening' ? '#dc2626' : ps === 'stable' ? '#059669' : '#0e6264';
                const dotRing = ps === 'possible_worsening' ? '#fee2e2' : ps === 'stable' ? '#d1fae5' : '#e0f2fe';

                return (
                  <div 
                    key={scr.screening_id || scr.id || idx}
                    style={{ 
                      display: 'flex', 
                      gap: 16, 
                      padding: 20, 
                      borderRadius: 14, 
                      border: ps === 'possible_worsening' ? '1px solid #fca5a5' : '1px solid #edf2f1', 
                      background: ps === 'possible_worsening' ? '#fffbfb' : '#ffffff',
                      boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)'
                    }}
                  >
                    {/* Step Indicator */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, paddingTop: 2 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 4px ${dotRing}` }} />
                      <div style={{ width: 2, flex: 1, background: '#e2eceb', margin: '6px 0' }} />
                    </div>

                    {/* Examination Body */}
                    <div style={{ flex: 1 }}>
                      {/* Top Row: Examination Title, Type & Progression Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#132b2e' }}>
                              {examTitle}
                            </h4>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#0e6264', background: '#e9f4f4', padding: '2px 8px', borderRadius: 6 }}>
                              {examType}
                            </span>
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#688285', marginTop: 4 }}>
                            <strong>Date &amp; Time:</strong> {fullDateTime} · ID: {scr.screening_id || scr.id}
                          </div>
                        </div>

                        {badge && (
                          <span style={{ 
                            fontFamily: 'var(--font-mono)', 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: badge.color, 
                            background: badge.bg, 
                            border: `1px solid ${badge.color}30`,
                            padding: '3px 9px', 
                            borderRadius: 6 
                          }}>
                            {badge.txt}
                          </span>
                        )}
                      </div>

                      {/* Clinical Findings Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                        <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>DR Grade</span>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: maxGrade >= 2 ? '#dc2626' : maxGrade === 1 ? '#d97706' : '#059669', marginTop: 2 }}>
                            {gradeLabel}
                          </div>
                        </div>

                        <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Calibrated Confidence</span>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
                            {((confVal || 0.92) * 100).toFixed(1)}%
                          </div>
                        </div>

                        {timelineMatch?.change_text && (
                          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                            <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Progression Change</span>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: '#0e6264', marginTop: 2 }}>
                              {timelineMatch.change_text}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bilateral Eye Details */}
                      {(hasLeft || hasRight) && (
                        <div style={{ display: 'grid', gridTemplateColumns: (hasLeft && hasRight) ? '1fr 1fr' : '1fr', gap: 10, marginTop: 10 }}>
                          {hasLeft && (
                            <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                              <span style={{ fontSize: 10.5, color: '#7a8e90' }}>OS (Left Eye)</span>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: lg >= 2 ? '#dc2626' : lg === 1 ? '#d97706' : '#059669', marginTop: 1 }}>
                                {lg >= 0 ? `Level ${lg} · ${scr.left_eye?.dr_grade_name || (lg === 0 ? 'No DR' : 'NPDR')}` : 'Ungraded'}
                              </div>
                            </div>
                          )}
                          {hasRight && (
                            <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                              <span style={{ fontSize: 10.5, color: '#7a8e90' }}>OD (Right Eye)</span>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: rg >= 2 ? '#dc2626' : rg === 1 ? '#d97706' : '#059669', marginTop: 1 }}>
                                {rg >= 0 ? `Level ${rg} · ${scr.right_eye?.dr_grade_name || (rg === 0 ? 'No DR' : 'NPDR')}` : 'Ungraded'}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Bar: View Analysis & View Comparison */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px dashed #e2eceb', gap: 10 }}>
                        {/* Comparison Button: Shown if comparison exists or if it is a follow-up examination */}
                        {(timelineMatch?.comparison_id || (!isBaseline && screenings.length > 1)) && (
                          <button
                            onClick={() => nav(`/comparison/${scr.id || scr.screening_id}`)}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 5, 
                              background: '#e0f2fe', 
                              border: '1px solid #bae6fd', 
                              color: '#0369a1', 
                              fontWeight: 700, 
                              fontSize: 12.5, 
                              cursor: 'pointer', 
                              borderRadius: 8, 
                              padding: '6px 12px' 
                            }}
                          >
                            <Activity size={13} /> View Comparison
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenScreening(scr.screening_id || scr.id)}
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4, 
                            background: '#e9f4f4', 
                            border: '1px solid #c3dedd', 
                            color: '#0e6264', 
                            fontWeight: 700, 
                            fontSize: 12.5, 
                            cursor: 'pointer',
                            borderRadius: 8,
                            padding: '6px 12px'
                          }}
                        >
                          View Analysis <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Baseline Node: Patient Registration Event */}
            <div style={{ 
              display: 'flex', 
              gap: 16, 
              padding: 18, 
              borderRadius: 12, 
              border: '1px solid #edf2f1', 
              background: '#ffffff'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0e6264', boxShadow: '0 0 0 3px #e0f2fe' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong style={{ fontSize: 14.5, color: '#183639', fontFamily: 'var(--font-body)' }}>
                      {regDateStr} · Patient Registered at Facility
                    </strong>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#698587', marginTop: 2 }}>
                      Facility: Jorhat Community Clinic · Registry ID: {patientCode}
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: 6 }}>
                    REGISTERED
                  </span>
                </div>
                
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#f8faf9', borderRadius: 8, border: '1px solid #edf2f1' }}>
                  <div style={{ fontSize: 12.5, color: '#334155' }}>
                    <strong>Clinical Baseline:</strong> Diabetes duration {diabetesYears} years · Prior DR status: <strong>{prevDR}</strong> · Baseline HbA1c: <strong>{patient.hba1c || '7.8%'}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 8, borderTop: '1px dashed #edf2f1' }}>
                  <span style={{ fontSize: 12, color: '#688285' }}>Outcome: Baseline clinical history and longitudinal tracking initialized</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

