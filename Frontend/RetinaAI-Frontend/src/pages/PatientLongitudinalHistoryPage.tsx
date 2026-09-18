import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Activity, Calendar, Clock, Eye, 
  TrendingUp, TrendingDown, Minus, AlertTriangle, 
  CheckCircle2, Info, ChevronRight, FileText, 
  Plus, ShieldCheck, UserRound, ArrowRight, Layers, 
  Crosshair, Sparkles, SlidersHorizontal
} from 'lucide-react';
import { Badge, Button } from '../components';
import { getPatient } from '../services/patients';
import { getPatientTimeline, getScreening } from '../services/screenings';
import { useScreening } from '../contexts/ScreeningContext';
import { ProgressionStatus, TimelineItem } from '../types';
import { BACKEND_URL, apiClient } from '../services/api';

const BACKEND = BACKEND_URL;
const pathToUrl = (path: string | null | undefined, fallback = '/retina.svg'): string => {
  if (!path) return fallback;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path;
  const normalized = path.replace(/\\/g, '/');
  const staticIdx = normalized.indexOf('static/');
  if (staticIdx !== -1) {
    return `${BACKEND}/api/media/${normalized.slice(staticIdx + 7)}`;
  }
  if (normalized.startsWith('/api/media/')) {
    return `${BACKEND}${normalized}`;
  }
  if (normalized.startsWith('api/media/')) {
    return `${BACKEND}/${normalized}`;
  }
  const clean = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${BACKEND}/api/media${clean}`;
};

function AuthenticatedImg({
  src,
  alt,
  fallback = '/retina.svg',
  style,
  className,
  onError,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (!src || src === fallback || src.startsWith('data:') || src.startsWith('blob:')) {
      setBlobUrl(null);
      return;
    }

    if ((src.startsWith('http://') || src.startsWith('https://')) && !src.includes('/api/media/')) {
      setBlobUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    apiClient.get(src, { responseType: 'blob' })
      .then(res => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([res.data]));
        setBlobUrl(objectUrl);
      })
      .catch(err => {
        if (!active) return;
        console.error('Failed to load protected media:', err);
        setHasError(true);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, fallback]);

  const effectiveSrc = hasError
    ? fallback
    : blobUrl
    ? blobUrl
    : (src || fallback);

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      style={style}
      className={className}
      onError={(e) => {
        setHasError(true);
        if (onError) onError(e);
      }}
      {...props}
    />
  );
}

const GRADE_MAP: Record<number, { name: string; short: string; color: string; bg: string; border: string }> = {
  0: { name: 'No Diabetic Retinopathy', short: 'No DR', color: '#059669', bg: '#d1fae5', border: '#a7f3d0' },
  1: { name: 'Mild NPDR', short: 'Mild NPDR', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  2: { name: 'Moderate NPDR', short: 'Mod NPDR', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  3: { name: 'Severe NPDR', short: 'Severe NPDR', color: '#991b1b', bg: '#fee2e2', border: '#f87171' },
  4: { name: 'Proliferative DR', short: 'PDR', color: '#581c87', bg: '#f3e8ff', border: '#d8b4fe' },
};

function progressionConfig(status: ProgressionStatus | null) {
  switch (status) {
    case 'baseline':
      return { label: 'Baseline Established', color: '#0369a1', bg: '#e0f2fe', icon: <Info size={16} /> };
    case 'stable':
      return { label: 'AI: No Significant Change', color: '#059669', bg: '#d1fae5', icon: <CheckCircle2 size={16} /> };
    case 'possible_improvement':
      return { label: 'AI: Possible Improvement', color: '#0369a1', bg: '#e0f2fe', icon: <TrendingDown size={16} /> };
    case 'possible_worsening':
      return { label: 'AI: Possible Worsening', color: '#dc2626', bg: '#fee2e2', icon: <TrendingUp size={16} /> };
    case 'indeterminate':
    default:
      return { label: 'Indeterminate', color: '#92400e', bg: '#fef3c7', icon: <AlertTriangle size={16} /> };
  }
}

export default function PatientLongitudinalHistoryPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setScreeningId, setPatient: setScreeningPatient, setResult, reset } = useScreening();

  const [patient, setPatient] = useState<any>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      setLoading(true);
      try {
        const [patData, timeData] = await Promise.all([
          getPatient(id).catch(() => null),
          getPatientTimeline(id).catch(() => null),
        ]);

        if (patData) setPatient(patData);
        if (timeData?.timeline) {
          setTimelineItems(timeData.timeline);
        } else if (patData?.screenings && patData.screenings.length > 0) {
          // Fallback parsing if timeline endpoint is unavailable
          const items: TimelineItem[] = patData.screenings.map((scr: any, idx: number) => {
            const lg = scr.left_eye?.dr_grade ?? -1;
            const rg = scr.right_eye?.dr_grade ?? -1;
            const maxG = Math.max(lg, rg);
            return {
              exam_number: patData.screenings.length - idx,
              exam_title: `Examination ${patData.screenings.length - idx}`,
              exam_type: idx === patData.screenings.length - 1 ? 'Baseline Examination' : 'Follow-up Examination',
              screening_id: scr.id || scr.screening_id,
              screening_display_id: scr.screening_id || scr.id,
              created_at: scr.created_at,
              status: scr.status,
              left_dr_grade: lg >= 0 ? lg : null,
              right_dr_grade: rg >= 0 ? rg : null,
              max_grade: maxG >= 0 ? maxG : 0,
              confidence: scr.left_eye?.confidence_calibrated || scr.right_eye?.confidence_calibrated || 0.92,
              overall_referable: scr.overall_referable,
              review_status: scr.review_status,
              comparison_id: null,
              progression_status: (idx === patData.screenings.length - 1) ? 'baseline' : 'stable',
            };
          });
          setTimelineItems(items);
        }
      } catch (err) {
        console.error('Error loading patient longitudinal history:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  // Chronological order (oldest to newest) for graph
  const chronological = useMemo(() => {
    return [...timelineItems].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [timelineItems]);

  // Baseline and latest examinations
  const baselineExam = chronological.length > 0 ? chronological[0] : null;
  const latestExam = chronological.length > 0 ? chronological[chronological.length - 1] : null;

  // Longitudinal transition assessment
  const classificationShiftText = useMemo(() => {
    if (chronological.length <= 1 || !baselineExam || !latestExam) {
      return 'Baseline established. Future examinations will be compared against this examination.';
    }
    const bGrade = baselineExam.max_grade ?? 0;
    const lGrade = latestExam.max_grade ?? 0;
    if (lGrade > bGrade) {
      return `AI classification increased from Level ${bGrade} to Level ${lGrade}.`;
    }
    if (lGrade < bGrade) {
      return `AI classification decreased from Level ${bGrade} to Level ${lGrade}.`;
    }
    return 'No change in DR classification.';
  }, [chronological, baselineExam, latestExam]);

  // Overall longitudinal status from latest comparison
  const overallProgressionStatus: ProgressionStatus | null = useMemo(() => {
    if (timelineItems.length <= 1) return 'baseline';
    const nonBaseline = timelineItems.find(t => t.progression_status && t.progression_status !== 'baseline');
    if (nonBaseline?.progression_status) return nonBaseline.progression_status;
    return timelineItems[0]?.progression_status || 'stable';
  }, [timelineItems]);

  // Unified Screening Comparison State
  const [prevExamId, setPrevExamId] = useState<string>('');
  const [currExamId, setCurrExamId] = useState<string>('');
  const [activeCompareTab, setActiveCompareTab] = useState<'dr' | 'lesions' | 'vessels' | 'fovea' | 'other'>('dr');
  const [compareEye, setCompareEye] = useState<'left' | 'right'>('left');
  const [screeningCache, setScreeningCache] = useState<Record<string, any>>({});
  const [loadingCompareDetails, setLoadingCompareDetails] = useState(false);

  // Initialize default selection: Previous = second-most-recent, Current = most-recent
  useEffect(() => {
    if (chronological.length >= 2) {
      const prevId = chronological[chronological.length - 2].screening_id;
      const currId = chronological[chronological.length - 1].screening_id;
      setPrevExamId(prevId);
      setCurrExamId(currId);
    } else if (chronological.length === 1) {
      setPrevExamId(chronological[0].screening_id);
      setCurrExamId(chronological[0].screening_id);
    }
  }, [chronological]);

  // Fetch full screening detail for selected previous and current examinations
  useEffect(() => {
    async function loadScreeningDetails() {
      const idsToFetch = [prevExamId, currExamId].filter(sid => sid && !screeningCache[sid]);
      if (idsToFetch.length === 0) return;
      setLoadingCompareDetails(true);
      try {
        const fetchedResults = await Promise.all(
          idsToFetch.map(async sid => {
            try {
              const res = await getScreening(sid);
              return { sid, res };
            } catch {
              return { sid, res: null };
            }
          })
        );
        setScreeningCache(prev => {
          const updated = { ...prev };
          fetchedResults.forEach(({ sid, res }) => {
            if (res) updated[sid] = res;
          });
          return updated;
        });
      } finally {
        setLoadingCompareDetails(false);
      }
    }
    loadScreeningDetails();
  }, [prevExamId, currExamId]);

  const prevScreeningDetail = screeningCache[prevExamId] || null;
  const currScreeningDetail = screeningCache[currExamId] || null;

  const prevTimelineMatch = chronological.find(e => e.screening_id === prevExamId);
  const currTimelineMatch = chronological.find(e => e.screening_id === currExamId);

  const handleOpenScreening = async (screeningId: string) => {
    reset();
    setScreeningId(screeningId);
    setScreeningPatient(patient?.patient_display_id || id || '', patient?.name || 'Patient');
    try {
      const full = screeningCache[screeningId] || await getScreening(screeningId);
      if (full) setResult(full);
    } catch {
      // Fallback
    }
    nav(`/history/${screeningId}`);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: '#688285' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#183639', marginBottom: 8 }}>
          Loading Longitudinal Retinal Progression History...
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Patient ID: {id}</div>
      </div>
    );
  }

  const patientCode = patient?.patient_display_id || patient?.patientId || id;
  const diabetesYears = patient?.diabetes_duration ?? patient?.diabetesDuration ?? 0;
  const regDateStr = patient?.created_at
    ? new Date(patient.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Registered';
  const latestExamDateStr = latestExam?.created_at
    ? new Date(latestExam.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'No examination';

  // SVG Graph Layout Calculations
  const graphWidth = 720;
  const graphHeight = 260;
  const padLeft = 85;
  const padRight = 50;
  const padTop = 35;
  const padBottom = 45;

  const innerW = graphWidth - padLeft - padRight;
  const innerH = graphHeight - padTop - padBottom;

  // Y coordinate for DR level 0 to 4 (Level 4 at top, Level 0 at bottom)
  const getY = (level: number) => {
    const norm = Math.max(0, Math.min(4, level)) / 4;
    return padTop + (1 - norm) * innerH;
  };

  // X coordinate for examination index
  const getX = (idx: number, total: number) => {
    if (total <= 1) return padLeft + innerW / 2;
    return padLeft + (idx / (total - 1)) * innerW;
  };

  const points = chronological.map((ex, idx) => {
    const x = getX(idx, chronological.length);
    const y = getY(ex.max_grade ?? 0);
    const dt = ex.created_at ? new Date(ex.created_at) : new Date();
    const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return {
      x,
      y,
      exam: ex,
      idx,
      dateStr,
      timeStr,
      grade: ex.max_grade ?? 0,
      conf: ((ex.confidence ?? 0.92) * 100).toFixed(1),
    };
  });

  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : '';

  const progConf = progressionConfig(overallProgressionStatus);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>
      {/* Breadcrumb & Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <button 
            onClick={() => nav(`/patients/${patient?.id || id}`)}
            style={{ 
              display: 'inline-flex', alignItems: 'center', gap: 6, 
              background: 'none', border: 'none', color: '#0e6264', 
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, 
              cursor: 'pointer', padding: 0, marginBottom: 8 
            }}
          >
            <ArrowLeft size={16} /> Back to Patient Profile
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: '#132b2e', margin: 0 }}>
              Longitudinal Retinal Progression Analysis
            </h1>
            <span style={{ 
              fontFamily: 'var(--font-mono)', fontSize: 13, 
              background: '#e9f2f2', color: '#0e6264', fontWeight: 700, 
              padding: '4px 10px', borderRadius: 6 
            }}>
              {patientCode}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#688285', fontSize: 13.5, fontFamily: 'var(--font-body)' }}>
            Chronological multi-visit retinal tracking and AI-assisted classification trajectory
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button 
            variant="secondary" 
            onClick={() => nav('/patients')}
            style={{ borderRadius: 10, fontSize: 13 }}
          >
            <UserRound size={14} /> Patient Directory
          </Button>

          <Button 
            onClick={() => nav(`/screening/new?patientId=${patient?.id || id}`)}
            style={{ 
              background: '#0e6264', color: '#ffffff', borderRadius: 10, 
              fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 
            }}
          >
            <Plus size={15} /> 
            {chronological.length === 0 
              ? 'Initiate Baseline Screening' 
              : chronological.length === 1 
              ? 'Second Longitudinal Screening' 
              : `New Longitudinal Screening (Exam ${chronological.length + 1})`}
          </Button>
        </div>
      </div>

      {/* 1. Patient Information Header Card */}
      <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: '20px 24px', boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0e6264' }}>
              PATIENT CLINICAL PROFILE
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
              {patient?.name || 'Patient Record'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ 
              fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 600, color: '#166534', 
              background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 12,
              display: 'inline-flex', alignItems: 'center', gap: 5
            }}>
              <CheckCircle2 size={12} /> {chronological.length} Verified Examination{chronological.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 10 }}>
            <span style={{ fontSize: 11, color: '#688285' }}>Patient System ID</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#0e6264', marginTop: 2 }}>
              {patientCode}
            </div>
          </div>

          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 10 }}>
            <span style={{ fontSize: 11, color: '#688285' }}>Age &amp; Sex</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
              {patient?.age || '—'} yrs · {patient?.sex === 'M' ? 'Male' : patient?.sex === 'F' ? 'Female' : patient?.sex || '—'}
            </div>
          </div>

          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 10 }}>
            <span style={{ fontSize: 11, color: '#688285' }}>Diabetes Duration</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
              {diabetesYears} years
            </div>
          </div>

          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 10 }}>
            <span style={{ fontSize: 11, color: '#688285' }}>Registration Date</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#132b2e', marginTop: 2 }}>
              {regDateStr}
            </div>
          </div>

          <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 10 }}>
            <span style={{ fontSize: 11, color: '#688285' }}>Latest Examination</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#0e6264', marginTop: 2 }}>
              {latestExamDateStr}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Longitudinal Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {/* Baseline Card */}
        <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#779193', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Baseline Examination
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#132b2e', marginTop: 6 }}>
            {baselineExam ? (
              <span style={{ color: GRADE_MAP[baselineExam.max_grade ?? 0]?.color || '#132b2e' }}>
                Level {baselineExam.max_grade ?? 0} — {GRADE_MAP[baselineExam.max_grade ?? 0]?.short}
              </span>
            ) : (
              'None'
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#688285', marginTop: 4 }}>
            {baselineExam?.created_at ? new Date(baselineExam.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending intake'}
          </div>
        </div>

        {/* Latest Card */}
        <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#779193', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Latest Examination
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#132b2e', marginTop: 6 }}>
            {latestExam ? (
              <span style={{ color: GRADE_MAP[latestExam.max_grade ?? 0]?.color || '#132b2e' }}>
                Level {latestExam.max_grade ?? 0} — {GRADE_MAP[latestExam.max_grade ?? 0]?.short}
              </span>
            ) : (
              'None'
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#688285', marginTop: 4 }}>
            {latestExam?.created_at ? new Date(latestExam.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending'}
          </div>
        </div>

        {/* Change Card */}
        <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#779193', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Classification Shift
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: '#0e6264', marginTop: 6 }}>
            {chronological.length <= 1 
              ? 'Baseline established' 
              : `Level ${baselineExam?.max_grade ?? 0} → Level ${latestExam?.max_grade ?? 0}`}
          </div>
          <div style={{ fontSize: 12, color: '#688285', marginTop: 4 }}>
            {chronological.length <= 1 ? 'Initial reference visit' : classificationShiftText}
          </div>
        </div>

        {/* Current Longitudinal Status Card */}
        <div style={{ 
          background: '#ffffff', 
          border: `1px solid ${progConf.color}40`, 
          borderRadius: 14, 
          padding: '18px 20px', 
          boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#779193', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Current Status
            </span>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: progConf.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: progConf.color }}>
              {progConf.icon}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: progConf.color, marginTop: 6 }}>
            {progConf.label}
          </div>
          <div style={{ fontSize: 12, color: '#688285', marginTop: 4 }}>
            Derived from automated longitudinal comparison
          </div>
        </div>
      </div>

      {/* 3. DR History Line Graph */}
      <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0e6264' }}>
              AI-ASSISTED DR CLASSIFICATION HISTORY
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#132b2e', margin: '4px 0 2px' }}>
              Diabetic Retinopathy History
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#688285' }}>
              DR severity across retinal examinations · AI screening history
            </p>
          </div>

          <div style={{ background: '#f8faf9', border: '1px solid #edf2f1', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#4b6366' }}>
            <strong>Trend Summary:</strong> {classificationShiftText}
          </div>
        </div>

        {chronological.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', background: '#fafcfc', borderRadius: 12, border: '1px dashed #dbe5e5' }}>
            <Activity size={32} color="#0e6264" style={{ margin: '0 auto 10px', opacity: 0.7 }} />
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#132b2e', margin: '0 0 6px' }}>
              No retinal examinations available
            </h4>
            <p style={{ fontSize: 13, color: '#688285', maxWidth: 420, margin: '0 auto 16px' }}>
              No digital fundus screenings have been recorded for this patient yet. Initiate a baseline examination to generate the longitudinal tracking graph.
            </p>
            <Button 
              onClick={() => nav(`/screening/new?patientId=${patient?.id || id}`)}
              style={{ background: '#0e6264', color: '#fff', borderRadius: 9, fontSize: 13 }}
            >
              <Plus size={14} /> Start Baseline Screening
            </Button>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg 
              viewBox={`0 0 ${graphWidth} ${graphHeight}`} 
              style={{ width: '100%', height: 'auto', minWidth: 550, display: 'block' }}
            >
              {/* Y-axis gridlines & severity labels */}
              {[4, 3, 2, 1, 0].map(lvl => {
                const y = getY(lvl);
                const info = GRADE_MAP[lvl];
                return (
                  <g key={lvl}>
                    <line 
                      x1={padLeft} 
                      y1={y} 
                      x2={graphWidth - padRight} 
                      y2={y} 
                      stroke="#eef3f2" 
                      strokeDasharray="4 4" 
                      strokeWidth={1} 
                    />
                    <text 
                      x={padLeft - 12} 
                      y={y + 4} 
                      textAnchor="end" 
                      fontSize={11} 
                      fontFamily="var(--font-body)" 
                      fontWeight={600} 
                      fill={info.color}
                    >
                      {lvl} — {info.short}
                    </text>
                  </g>
                );
              })}

              {/* Y Axis line */}
              <line 
                x1={padLeft} 
                y1={padTop} 
                x2={padLeft} 
                y2={graphHeight - padBottom} 
                stroke="#cbd8d8" 
                strokeWidth={1.5} 
              />

              {/* X Axis line */}
              <line 
                x1={padLeft} 
                y1={graphHeight - padBottom} 
                x2={graphWidth - padRight} 
                y2={graphHeight - padBottom} 
                stroke="#cbd8d8" 
                strokeWidth={1.5} 
              />

              {/* Trajectory Polyline (if 2+ exams) */}
              {points.length > 1 && (
                <>
                  {/* Subtle Gradient Area fill */}
                  <path 
                    d={`${pathD} L ${points[points.length - 1].x} ${graphHeight - padBottom} L ${points[0].x} ${graphHeight - padBottom} Z`}
                    fill="rgba(14, 98, 100, 0.05)"
                  />
                  <path 
                    d={pathD} 
                    fill="none" 
                    stroke="#0e6264" 
                    strokeWidth={2.5} 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                </>
              )}

              {/* Plotted Examination Data Points */}
              {points.map((p) => {
                const color = GRADE_MAP[p.grade]?.color || '#0e6264';
                const isHovered = hoveredPoint?.exam?.screening_id === p.exam.screening_id;
                return (
                  <g 
                    key={p.exam.screening_id || p.idx}
                    onMouseEnter={() => setHoveredPoint(p)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    onClick={() => handleOpenScreening(p.exam.screening_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Pulsing ring on hover */}
                    {isHovered && (
                      <circle 
                        cx={p.x} 
                        cy={p.y} 
                        r={12} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={2} 
                        opacity={0.4} 
                      />
                    )}
                    <circle 
                      cx={p.x} 
                      cy={p.y} 
                      r={6} 
                      fill="#ffffff" 
                      stroke={color} 
                      strokeWidth={3} 
                    />

                    {/* Date label beneath X-axis */}
                    <text 
                      x={p.x} 
                      y={graphHeight - padBottom + 16} 
                      textAnchor="middle" 
                      fontSize={11} 
                      fontFamily="var(--font-mono)" 
                      fontWeight={600} 
                      fill="#4a6568"
                    >
                      {p.dateStr}
                    </text>
                    <text 
                      x={p.x} 
                      y={graphHeight - padBottom + 28} 
                      textAnchor="middle" 
                      fontSize={9.5} 
                      fontFamily="var(--font-mono)" 
                      fill="#81999b"
                    >
                      {p.exam.exam_title || `Exam ${p.idx + 1}`}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Interactive Tooltip on Hover */}
            {hoveredPoint && (
              <div style={{
                position: 'absolute',
                left: `${(hoveredPoint.x / graphWidth) * 100}%`,
                top: `${(hoveredPoint.y / graphHeight) * 100}%`,
                transform: 'translate(-50%, -125%)',
                background: '#0d2224',
                color: '#ffffff',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
                zIndex: 10,
                minWidth: 200,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#e6f5f3' }}>
                  {hoveredPoint.exam.exam_title} · {hoveredPoint.exam.exam_type}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#97b8b6', marginTop: 3 }}>
                  {hoveredPoint.dateStr} at {hoveredPoint.timeStr}
                </div>
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>AI Classification:</span>
                  <strong style={{ color: GRADE_MAP[hoveredPoint.grade]?.border || '#fff' }}>
                    Level {hoveredPoint.grade} ({GRADE_MAP[hoveredPoint.grade]?.short})
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span>Confidence:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{hoveredPoint.conf}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span>Referable:</span>
                  <span style={{ color: hoveredPoint.exam.overall_referable ? '#fca5a5' : '#86efac', fontWeight: 600 }}>
                    {hoveredPoint.exam.overall_referable ? 'Yes' : 'No'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#688f8d', marginTop: 5 }}>
                  ID: {hoveredPoint.exam.screening_display_id || hoveredPoint.exam.screening_id}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Graph Footer Note */}
        {chronological.length === 1 && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 12.5, color: '#0369a1' }}>
            <Info size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            <strong>Baseline established.</strong> Future examinations will be compared against this examination to measure microvascular stability or progression.
          </div>
        )}
      </div>

      {/* 4. Unified Screening Comparison Block (Previous vs Current) */}
      <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0e6264' }}>
              LONGITUDINAL PAIRWISE EVALUATION
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#132b2e', margin: '4px 0 2px' }}>
              Screening Comparison
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#688285' }}>
              Select any two patient examinations to compare retinal morphology, lesion burden, vessel density, and biomarker shifts
            </p>
          </div>

          {/* Eye selector if bilateral data exists */}
          <div style={{ display: 'flex', background: '#f1f5f4', padding: '3px', borderRadius: 8 }}>
            <button
              onClick={() => setCompareEye('left')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: compareEye === 'left' ? '#0e6264' : 'transparent',
                color: compareEye === 'left' ? '#ffffff' : '#4d6467',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              OS · Left Eye
            </button>
            <button
              onClick={() => setCompareEye('right')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: compareEye === 'right' ? '#0e6264' : 'transparent',
                color: compareEye === 'right' ? '#ffffff' : '#4d6467',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              OD · Right Eye
            </button>
          </div>
        </div>

        {chronological.length < 2 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', background: '#f8faf9', borderRadius: 12, border: '1px dashed #d1dedd' }}>
            <Info size={28} color="#0e6264" style={{ margin: '0 auto 8px', opacity: 0.8 }} />
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#132b2e', margin: '0 0 4px' }}>
              Comparison requires at least two examinations
            </h4>
            <p style={{ fontSize: 12.5, color: '#688285', maxWidth: 420, margin: '0 auto' }}>
              A comparison will be available after the patient completes their next longitudinal screening.
            </p>
          </div>
        ) : (
          <div>
            {/* Examination Selectors Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, background: '#f8faf9', padding: '16px 20px', borderRadius: 12, border: '1px solid #edf2f1', marginBottom: 20 }}>
              {/* Previous Examination Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4b6366', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Previous Examination
                </label>
                <select
                  value={prevExamId}
                  onChange={(e) => setPrevExamId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 9,
                    border: '1px solid #cbd8d8',
                    background: '#ffffff',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#132b2e',
                    outline: 'none'
                  }}
                >
                  {chronological.map((item, idx) => (
                    <option key={item.screening_id} value={item.screening_id}>
                      {item.exam_title || `Examination ${idx + 1}`} ({item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}) · Level {item.max_grade ?? 0}
                    </option>
                  ))}
                </select>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7a9496', marginTop: 4 }}>
                  ID: {prevTimelineMatch?.screening_display_id || prevExamId}
                </div>
              </div>

              {/* Current Examination Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4b6366', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Current Examination
                </label>
                <select
                  value={currExamId}
                  onChange={(e) => setCurrExamId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 9,
                    border: '1px solid #cbd8d8',
                    background: '#ffffff',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#132b2e',
                    outline: 'none'
                  }}
                >
                  {chronological.map((item, idx) => (
                    <option key={item.screening_id} value={item.screening_id}>
                      {item.exam_title || `Examination ${idx + 1}`} ({item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}) · Level {item.max_grade ?? 0}
                    </option>
                  ))}
                </select>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7a9496', marginTop: 4 }}>
                  ID: {currTimelineMatch?.screening_display_id || currExamId}
                </div>
              </div>
            </div>

            {/* Side-by-Side Retinal Image Comparison Cards */}
            {(() => {
              const prevEyeData = compareEye === 'left' ? prevScreeningDetail?.left_eye : prevScreeningDetail?.right_eye;
              const currEyeData = compareEye === 'left' ? currScreeningDetail?.left_eye : currScreeningDetail?.right_eye;

              const prevImgUrl = pathToUrl(prevEyeData?.original_image_url);
              const currImgUrl = pathToUrl(currEyeData?.original_image_url);

              const prevDate = prevTimelineMatch?.created_at ? new Date(prevTimelineMatch.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
              const prevTime = prevTimelineMatch?.created_at ? new Date(prevTimelineMatch.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

              const currDate = currTimelineMatch?.created_at ? new Date(currTimelineMatch.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
              const currTime = currTimelineMatch?.created_at ? new Date(currTimelineMatch.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                  {/* Previous Examination Card */}
                  <div style={{ background: '#f8faf9', border: '1px solid #edf2f1', borderRadius: 14, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Previous Examination ({prevTimelineMatch?.exam_title || 'Previous'})
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#688285' }}>
                        {compareEye === 'left' ? 'OS · Left' : 'OD · Right'}
                      </span>
                    </div>

                    <div style={{ position: 'relative', width: '100%', height: 230, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                      <AuthenticatedImg
                        src={prevImgUrl}
                        alt="Previous Retinal Fundus"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(9,34,36,0.82)', color: '#d8f3ef', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        Retinal Fundus
                      </span>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12 }}>
                      <div>
                        <strong style={{ color: '#132b2e' }}>{prevDate} · {prevTime}</strong>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7a9496', marginTop: 1 }}>
                          {prevTimelineMatch?.screening_display_id || prevExamId}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: GRADE_MAP[prevTimelineMatch?.max_grade ?? 0]?.bg || '#f1f5f9',
                        color: GRADE_MAP[prevTimelineMatch?.max_grade ?? 0]?.color || '#374151'
                      }}>
                        Level {prevTimelineMatch?.max_grade ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Transition Arrow */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eaf4f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0e6264' }}>
                      <ArrowRight size={18} strokeWidth={2.4} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#779193', textTransform: 'uppercase', marginTop: 4 }}>VS</span>
                  </div>

                  {/* Current Examination Card */}
                  <div style={{ background: '#f8faf9', border: '1px solid #edf2f1', borderRadius: 14, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Current Examination ({currTimelineMatch?.exam_title || 'Current'})
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#688285' }}>
                        {compareEye === 'left' ? 'OS · Left' : 'OD · Right'}
                      </span>
                    </div>

                    <div style={{ position: 'relative', width: '100%', height: 230, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                      <AuthenticatedImg
                        src={currImgUrl}
                        alt="Current Retinal Fundus"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(9,34,36,0.82)', color: '#d8f3ef', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        Retinal Fundus
                      </span>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12 }}>
                      <div>
                        <strong style={{ color: '#132b2e' }}>{currDate} · {currTime}</strong>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7a9496', marginTop: 1 }}>
                          {currTimelineMatch?.screening_display_id || currExamId}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: GRADE_MAP[currTimelineMatch?.max_grade ?? 0]?.bg || '#f1f5f9',
                        color: GRADE_MAP[currTimelineMatch?.max_grade ?? 0]?.color || '#374151'
                      }}>
                        Level {currTimelineMatch?.max_grade ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Category Switcher Segmented Tab Bar */}
            <div style={{
              display: 'flex',
              gap: 8,
              background: '#f1f5f4',
              padding: '5px',
              borderRadius: 12,
              marginBottom: 20,
              overflowX: 'auto'
            }}>
              {[
                { id: 'dr', label: 'DR Grade' },
                { id: 'lesions', label: 'Lesions' },
                { id: 'vessels', label: 'Vessels' },
                { id: 'fovea', label: 'Fovea' },
                { id: 'other', label: 'Other' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCompareTab(tab.id as any)}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeCompareTab === tab.id ? '#ffffff' : 'transparent',
                    color: activeCompareTab === tab.id ? '#0e6264' : '#5b7679',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: activeCompareTab === tab.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Selected Analysis Content Area */}
            <div style={{ background: '#fafcfc', border: '1px solid #eef3f2', borderRadius: 14, padding: 22 }}>
              {(() => {
                const prevEye = compareEye === 'left' ? prevScreeningDetail?.left_eye : prevScreeningDetail?.right_eye;
                const currEye = compareEye === 'left' ? currScreeningDetail?.left_eye : currScreeningDetail?.right_eye;

                // 1. DR GRADE TAB
                if (activeCompareTab === 'dr') {
                  const pGrade = prevEye?.dr_grade ?? prevTimelineMatch?.max_grade ?? 0;
                  const cGrade = currEye?.dr_grade ?? currTimelineMatch?.max_grade ?? 0;

                  const pConf = ((prevEye?.confidence_calibrated ?? prevTimelineMatch?.confidence ?? 0.92) * 100).toFixed(1);
                  const cConf = ((currEye?.confidence_calibrated ?? currTimelineMatch?.confidence ?? 0.92) * 100).toFixed(1);

                  const delta = cGrade - pGrade;
                  let deltaText = 'No change in DR classification.';
                  if (delta > 0) deltaText = `AI classification increased from Level ${pGrade} to Level ${cGrade}.`;
                  if (delta < 0) deltaText = `AI classification decreased from Level ${pGrade} to Level ${cGrade}.`;

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                        Diabetic Retinopathy Classification Shift
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center' }}>
                        {/* Previous Grade */}
                        <div style={{ background: '#ffffff', padding: 16, borderRadius: 10, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#779193', textTransform: 'uppercase', fontWeight: 600 }}>Previous Severity</span>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: GRADE_MAP[pGrade]?.color || '#132b2e', marginTop: 4 }}>
                            Level {pGrade} — {GRADE_MAP[pGrade]?.name || 'DR Graded'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#567275', marginTop: 4 }}>
                            Calibrated Confidence: <strong>{pConf}%</strong>
                          </div>
                          <div style={{ fontSize: 12, color: prevEye?.referable ? '#dc2626' : '#059669', marginTop: 2, fontWeight: 600 }}>
                            {prevEye?.referable ? 'Referable DR Detected' : 'Non-Referable Protocol'}
                          </div>
                        </div>

                        {/* Transition Indicator */}
                        <div style={{ textAlign: 'center', padding: '0 8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: delta > 0 ? '#dc2626' : delta < 0 ? '#059669' : '#4b6366' }}>
                            {delta > 0 ? '▲ + ' + delta : delta < 0 ? '▼ ' + delta : '→ 0'}
                          </span>
                        </div>

                        {/* Current Grade */}
                        <div style={{ background: '#ffffff', padding: 16, borderRadius: 10, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#779193', textTransform: 'uppercase', fontWeight: 600 }}>Current Severity</span>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: GRADE_MAP[cGrade]?.color || '#132b2e', marginTop: 4 }}>
                            Level {cGrade} — {GRADE_MAP[cGrade]?.name || 'DR Graded'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#567275', marginTop: 4 }}>
                            Calibrated Confidence: <strong>{cConf}%</strong>
                          </div>
                          <div style={{ fontSize: 12, color: currEye?.referable ? '#dc2626' : '#059669', marginTop: 2, fontWeight: 600 }}>
                            {currEye?.referable ? 'Referable DR Detected' : 'Non-Referable Protocol'}
                          </div>
                        </div>
                      </div>

                      {/* Summary Banner */}
                      <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: '#166534', fontWeight: 600 }}>
                          <strong>Transition:</strong> {deltaText}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                          background: delta > 0 ? '#fee2e2' : delta < 0 ? '#e0f2fe' : '#d1fae5',
                          color: delta > 0 ? '#dc2626' : delta < 0 ? '#0369a1' : '#059669'
                        }}>
                          {delta > 0 ? 'AI: Possible Worsening' : delta < 0 ? 'AI: Possible Improvement' : 'AI: No Significant Change'}
                        </span>
                      </div>
                    </div>
                  );
                }

                // 2. LESIONS TAB
                if (activeCompareTab === 'lesions') {
                  const prevLesion = prevEye?.lesion;
                  const currLesion = currEye?.lesion;

                  const hasLesions = prevLesion || currLesion;
                  const prevOverlay = prevLesion?.overlay_url || prevEye?.lesion_overlay_url;
                  const currOverlay = currLesion?.overlay_url || currEye?.lesion_overlay_url;

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                        Retinal Lesion Analysis Comparison
                      </div>

                      {/* Side-by-Side Lesion Visuals */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Previous Lesion Overlay</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {prevOverlay ? (
                              <AuthenticatedImg src={pathToUrl(prevOverlay)} alt="Previous Lesions" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Current Lesion Overlay</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {currOverlay ? (
                              <AuthenticatedImg src={pathToUrl(currOverlay)} alt="Current Lesions" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Available Lesion Metrics / Counts */}
                      {hasLesions ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                          {/* Microaneurysms */}
                          <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                            <strong style={{ fontSize: 12, color: '#132b2e' }}>Microaneurysms</strong>
                            <div style={{ fontSize: 12, color: '#4b6366', marginTop: 4 }}>
                              Prev: {prevLesion?.microaneurysm?.count ?? (prevLesion?.microaneurysm?.detected ? 'Detected' : '0')}
                            </div>
                            <div style={{ fontSize: 12, color: '#4b6366' }}>
                              Curr: {currLesion?.microaneurysm?.count ?? (currLesion?.microaneurysm?.detected ? 'Detected' : '0')}
                            </div>
                          </div>

                          {/* Hemorrhages */}
                          <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                            <strong style={{ fontSize: 12, color: '#132b2e' }}>Intraretinal Hemorrhages</strong>
                            <div style={{ fontSize: 12, color: '#4b6366', marginTop: 4 }}>
                              Prev: {prevLesion?.hemorrhage?.detected ? 'Detected' : 'Clear'}
                            </div>
                            <div style={{ fontSize: 12, color: '#4b6366' }}>
                              Curr: {currLesion?.hemorrhage?.detected ? 'Detected' : 'Clear'}
                            </div>
                          </div>

                          {/* Hard Exudates */}
                          <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                            <strong style={{ fontSize: 12, color: '#132b2e' }}>Hard Exudates</strong>
                            <div style={{ fontSize: 12, color: '#4b6366', marginTop: 4 }}>
                              Prev: {prevLesion?.exudate?.detected ? 'Detected' : 'Clear'}
                            </div>
                            <div style={{ fontSize: 12, color: '#4b6366' }}>
                              Curr: {currLesion?.exudate?.detected ? 'Detected' : 'Clear'}
                            </div>
                          </div>

                          {/* Neovascularization */}
                          <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                            <strong style={{ fontSize: 12, color: '#132b2e' }}>Neovascularization</strong>
                            <div style={{ fontSize: 12, color: '#4b6366', marginTop: 4 }}>
                              Prev: {prevLesion?.neovascularization?.detected ? 'Detected' : 'Clear'}
                            </div>
                            <div style={{ fontSize: 12, color: '#4b6366' }}>
                              Curr: {currLesion?.neovascularization?.detected ? 'Detected' : 'Clear'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '12px 14px', background: '#f8faf9', borderRadius: 8, border: '1px solid #edf2f1', fontSize: 12, color: '#688285' }}>
                          Quantitative lesion quantification data not available for this examination pair.
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. VESSELS TAB
                if (activeCompareTab === 'vessels') {
                  const prevVessel = prevEye?.vessel_overlay_url || prevEye?.vessel_mask_url;
                  const currVessel = currEye?.vessel_overlay_url || currEye?.vessel_mask_url;

                  // 1. Vessel Density
                  const prevDensity = prevEye?.vessel_density;
                  const currDensity = currEye?.vessel_density;
                  const hasDensity = prevDensity !== null && prevDensity !== undefined && currDensity !== null && currDensity !== undefined;
                  const deltaDensity = hasDensity ? (currDensity - prevDensity) : null;

                  // 2. AVR
                  const prevAvr = prevEye?.biomarkers?.avr ?? prevEye?.avr;
                  const currAvr = currEye?.biomarkers?.avr ?? currEye?.avr;
                  const hasAvr = prevAvr !== null && prevAvr !== undefined && currAvr !== null && currAvr !== undefined;
                  const deltaAvr = hasAvr ? (currAvr - prevAvr) : null;

                  // 3. Mean Distance Tortuosity
                  const prevTort = prevEye?.biomarkers?.mean_tortuosity_distance ?? prevEye?.vessel_tortuosity;
                  const currTort = currEye?.biomarkers?.mean_tortuosity_distance ?? currEye?.vessel_tortuosity;
                  const hasTort = prevTort !== null && prevTort !== undefined && currTort !== null && currTort !== undefined;
                  const deltaTort = hasTort ? (currTort - prevTort) : null;

                  // 4. Fractal Dimension
                  const prevDf = prevEye?.biomarkers?.fractal_dimension ?? prevEye?.fractal_dimension;
                  const currDf = currEye?.biomarkers?.fractal_dimension ?? currEye?.fractal_dimension;
                  const hasDf = prevDf !== null && prevDf !== undefined && currDf !== null && currDf !== undefined;
                  const deltaDf = hasDf ? (currDf - prevDf) : null;

                  const renderDelta = (deltaVal: number | null, isPercent = false, decimals = 4) => {
                    if (deltaVal === null || deltaVal === undefined || isNaN(deltaVal)) {
                      return <span style={{ color: '#8fa5a7' }}>—</span>;
                    }
                    const sign = deltaVal > 0 ? '+' : '';
                    const formatted = isPercent
                      ? `${sign}${(deltaVal * 100).toFixed(2)}%`
                      : `${sign}${deltaVal.toFixed(decimals)}`;
                    const isZero = Math.abs(deltaVal) < 0.00005;
                    const arrow = isZero ? '→ ' : deltaVal > 0 ? '▲ ' : '▼ ';
                    const color = isZero ? '#527072' : deltaVal > 0 ? '#b91c1c' : '#167650';
                    return (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>
                        {arrow}{formatted}
                      </span>
                    );
                  };

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                        Retinal Microvasculature Segmentation &amp; Morphometric Biomarkers
                      </div>

                      {/* Side-by-Side Vessel Visuals */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Previous Vessel Mask / Overlay</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {prevVessel ? (
                              <AuthenticatedImg src={pathToUrl(prevVessel)} alt="Previous Vessel Mask" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Current Vessel Mask / Overlay</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {currVessel ? (
                              <AuthenticatedImg src={pathToUrl(currVessel)} alt="Current Vessel Mask" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quantitative Vascular Morphometry Comparison Table */}
                      <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #edf2f1', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f8faf9', borderBottom: '1px solid #edf2f1', color: '#688688', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Morphometric Biomarker</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Previous Exam</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Current Exam</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Longitudinal Shift (Δ)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Row 1: Vessel Density */}
                            <tr style={{ borderBottom: '1px solid #edf2f1' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#142e31' }}>Vessel Density</div>
                                <div style={{ fontSize: 10.5, color: '#7a9698' }}>Segmented vascular area fraction</div>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {prevDensity !== null && prevDensity !== undefined ? `${(prevDensity * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {currDensity !== null && currDensity !== undefined ? `${(currDensity * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {renderDelta(deltaDensity, true)}
                              </td>
                            </tr>

                            {/* Row 2: AVR */}
                            <tr style={{ borderBottom: '1px solid #edf2f1' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#142e31' }}>Arteriolar-to-Venular Ratio (AVR)</div>
                                <div style={{ fontSize: 10.5, color: '#7a9698' }}>Heuristic caliber ratio across Zone B</div>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {prevAvr !== null && prevAvr !== undefined ? prevAvr.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {currAvr !== null && currAvr !== undefined ? currAvr.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {renderDelta(deltaAvr, false, 4)}
                              </td>
                            </tr>

                            {/* Row 3: Mean Distance Tortuosity */}
                            <tr style={{ borderBottom: '1px solid #edf2f1' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#142e31' }}>Mean Distance Tortuosity (τ<sub>d</sub>)</div>
                                <div style={{ fontSize: 10.5, color: '#7a9698' }}>Arc-to-chord length ratio minus 1</div>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {prevTort !== null && prevTort !== undefined ? prevTort.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {currTort !== null && currTort !== undefined ? currTort.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {renderDelta(deltaTort, false, 4)}
                              </td>
                            </tr>

                            {/* Row 4: Fractal Dimension */}
                            <tr>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#142e31' }}>Fractal Dimension (D<sub>f</sub>)</div>
                                <div style={{ fontSize: 10.5, color: '#7a9698' }}>Box-counting vascular complexity</div>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {prevDf !== null && prevDf !== undefined ? prevDf.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#132b2e' }}>
                                {currDf !== null && currDf !== undefined ? currDf.toFixed(4) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {renderDelta(deltaDf, false, 4)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div style={{ fontSize: 11, color: '#7a9698', marginTop: 8, fontStyle: 'italic', lineHeight: 1.35 }}>
                        * Retinal microvascular biomarkers (AVR, tortuosity, fractal dimension) are computational research metrics. Changes reflect algorithmic morphometry across image pairs and do not constitute standalone clinical determinations.
                      </div>
                    </div>
                  );
                }

                // 4. FOVEA TAB
                if (activeCompareTab === 'fovea') {
                  const prevOdf = prevEye?.od_fovea_overlay_url;
                  const currOdf = currEye?.od_fovea_overlay_url;

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                        Fovea &amp; Optic Disc Localization
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Previous Fovea Marker</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {prevOdf ? (
                              <AuthenticatedImg src={pathToUrl(prevOdf)} alt="Previous Fovea Marker" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Current Fovea Marker</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {currOdf ? (
                              <AuthenticatedImg src={pathToUrl(currOdf)} alt="Current Fovea Marker" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stored Coordinates */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#779193' }}>Fovea Coordinates (Previous)</span>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#132b2e', marginTop: 2 }}>
                            {prevEye?.fovea_x !== null && prevEye?.fovea_y !== null && prevEye?.fovea_x !== undefined
                              ? `X: ${prevEye.fovea_x.toFixed(1)}, Y: ${prevEye.fovea_y.toFixed(1)}`
                              : 'Not recorded'}
                          </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#779193' }}>Fovea Coordinates (Current)</span>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#132b2e', marginTop: 2 }}>
                            {currEye?.fovea_x !== null && currEye?.fovea_y !== null && currEye?.fovea_x !== undefined
                              ? `X: ${currEye.fovea_x.toFixed(1)}, Y: ${currEye.fovea_y.toFixed(1)}`
                              : 'Not recorded'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // 5. OTHER TAB (Grad-CAM & Quality)
                if (activeCompareTab === 'other') {
                  const prevCam = prevEye?.gradcam_url;
                  const currCam = currEye?.gradcam_url;

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0e6264', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                        Model Attention &amp; Explainability (Grad-CAM)
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Previous Model Attention</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {prevCam ? (
                              <AuthenticatedImg src={pathToUrl(prevCam)} alt="Previous Grad-CAM" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#688285', marginBottom: 6, fontWeight: 600 }}>Current Model Attention</div>
                          <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 10, overflow: 'hidden', background: '#0a1d1f', border: '1px solid #1f2e30' }}>
                            {currCam ? (
                              <AuthenticatedImg src={pathToUrl(currCam)} alt="Current Grad-CAM" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8fa5a7', fontSize: 12 }}>
                                Not available for this examination
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1', lineHeight: 1.45 }}>
                        <Info size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                        <strong>Attention Map Disclaimer:</strong> Grad-CAM heatmaps illustrate regions that most strongly influenced the AI model's severity classification. Heatmaps represent network attention weights and are not direct anatomical lesion segmentations.
                      </div>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* 5. Complete Examination History */}
      <div style={{ background: '#ffffff', border: '1px solid #edf2f1', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0e6264' }}>
              COMPLETE VISIT LEDGER
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#132b2e', margin: '4px 0 2px' }}>
              Examination History
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#688285' }}>
              Chronological record of every independent retinal evaluation performed for patient {patientCode}
            </p>
          </div>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#0e6264', background: '#e9f4f4', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
            {timelineItems.length} Total Visit{timelineItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {timelineItems.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: '#688285' }}>
            No prior examination records found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Render in chronological order: Exam 1 (Baseline), Exam 2, Exam 3... */}
            {chronological.map((item, idx) => {
              const dt = item.created_at ? new Date(item.created_at) : new Date();
              const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              const isBaseline = idx === 0;
              const grade = item.max_grade ?? 0;
              const gradeInfo = GRADE_MAP[grade] || GRADE_MAP[0];
              const confPercent = ((item.confidence ?? 0.92) * 100).toFixed(1);
              const ps = item.progression_status || (isBaseline ? 'baseline' : 'stable');
              const itemProgConf = progressionConfig(ps);

              return (
                <div 
                  key={item.screening_id || idx}
                  style={{
                    display: 'flex',
                    gap: 18,
                    padding: '20px 22px',
                    borderRadius: 14,
                    border: ps === 'possible_worsening' ? '1px solid #fca5a5' : '1px solid #edf2f1',
                    background: ps === 'possible_worsening' ? '#fffaf9' : '#ffffff',
                    boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)',
                  }}
                >
                  {/* Timeline Indicator Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 26, paddingTop: 3 }}>
                    <div style={{ 
                      width: 14, height: 14, borderRadius: '50%', 
                      background: gradeInfo.color, 
                      boxShadow: `0 0 0 4px ${gradeInfo.bg}` 
                    }} />
                    {idx < chronological.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: '#e2eceb', margin: '8px 0' }} />
                    )}
                  </div>

                  {/* Content Body */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: '#132b2e' }}>
                            {item.exam_title || `Examination ${idx + 1}`}
                          </h4>
                          <span style={{ 
                            fontSize: 11.5, fontWeight: 600, color: '#0e6264', 
                            background: '#e9f4f4', padding: '2px 8px', borderRadius: 6 
                          }}>
                            {isBaseline ? 'Baseline Examination' : 'Follow-up Examination'}
                          </span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#688285', marginTop: 4 }}>
                          <strong>Date:</strong> {dateStr} · <strong>Time:</strong> {timeStr} · <strong>ID:</strong> {item.screening_display_id || item.screening_id}
                        </div>
                      </div>

                      {/* Longitudinal Status Badge */}
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: itemProgConf.color,
                        background: itemProgConf.bg,
                        border: `1px solid ${itemProgConf.color}30`,
                        padding: '3px 9px',
                        borderRadius: 6
                      }}>
                        {itemProgConf.label}
                      </span>
                    </div>

                    {/* Examination Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
                      <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                        <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>DR Grade</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: gradeInfo.color, marginTop: 2 }}>
                          Level {grade} — {gradeInfo.name}
                        </div>
                      </div>

                      <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                        <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Confidence</span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#132b2e', marginTop: 2 }}>
                          {confPercent}% calibrated
                        </div>
                      </div>

                      <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                        <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Referable DR</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: item.overall_referable ? '#dc2626' : '#059669', marginTop: 2 }}>
                          {item.overall_referable ? 'Yes (Referral Required)' : 'No (Routine Care)'}
                        </div>
                      </div>

                      {!isBaseline && item.change_text && (
                        <div style={{ background: '#f8faf9', padding: '10px 14px', borderRadius: 8, border: '1px solid #edf2f1' }}>
                          <span style={{ fontSize: 11, color: '#7a8e90', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Change</span>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#0e6264', marginTop: 2 }}>
                            {item.change_text}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Links */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px dashed #e2eceb', gap: 10 }}>
                      {!isBaseline && (
                        <button
                          onClick={() => nav(`/comparison/${item.screening_id}`)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1',
                            fontWeight: 700, fontSize: 12.5, cursor: 'pointer', borderRadius: 8, padding: '7px 14px'
                          }}
                        >
                          <Activity size={14} /> View Comparison
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenScreening(item.screening_id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: '#e9f4f4', border: '1px solid #c3dedd', color: '#0e6264',
                          fontWeight: 700, fontSize: 12.5, cursor: 'pointer', borderRadius: 8, padding: '7px 14px'
                        }}
                      >
                        <FileText size={14} /> View Analysis <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clinical Safety & Medical Framing Disclaimer Footer */}
      <div style={{ 
        background: '#f8faf9', border: '1px solid #e2eceb', borderRadius: 14, 
        padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' 
      }}>
        <ShieldCheck size={20} color="#0e6264" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#132b2e' }}>
            Medical Safety &amp; AI Classification Interpretation
          </div>
          <div style={{ fontSize: 12, color: '#527275', marginTop: 3, lineHeight: 1.5 }}>
            The Diabetic Retinopathy History graph visualizes AI-assisted screening classifications over time. A shift in AI classification alone does not prove biological disease progression. Longitudinal assessments are automated indicators intended to support, not replace, clinical decision-making. Final diagnosis and therapeutic intervention remain the responsibility of the reviewing ophthalmologist.
          </div>
        </div>
      </div>
    </div>
  );
}

