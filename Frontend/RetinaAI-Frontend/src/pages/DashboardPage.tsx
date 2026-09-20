import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  Activity, 
  ArrowRight, 
  ChevronRight, 
  MoreVertical, 
  Filter,
  CheckCircle2,
  TrendingDown,
  Plus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useScreening } from '../contexts/ScreeningContext';
import { getAnalyticsSummary } from '../services/analytics';
import { listScreenings, getScreening } from '../services/screenings';
import { AnalyticsSummary, ScreeningResult } from '../types';
import { ReviewQueueSection, QueueItem } from '../components/ReviewQueueSection';
import { getReviewQueue } from '../services/review';
import { SkeletonStatCards, SkeletonRecentTable } from '../components/SkeletonLoaders';

export default function DashboardPage() {
  const { user, isDoctor } = useAuth();
  const { setScreeningId, setPatient, setResult, reset } = useScreening();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<ScreeningResult[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [sum, rec, q] = await Promise.all([
          getAnalyticsSummary().catch(() => null),
          listScreenings({ page: 1 }).catch(() => ({ items: [] })),
          isDoctor ? getReviewQueue().catch(() => []) : Promise.resolve([])
        ]);

        if (sum) setSummary(sum);
        const screeningsList: ScreeningResult[] = rec?.screenings || rec?.items || (Array.isArray(rec) ? rec : []);
        setRecent(screeningsList);

        // Derive pending review items from getReviewQueue or fallback to pending screenings in list
        const rawPending = (Array.isArray(q) && q.length > 0)
          ? q
          : screeningsList.filter(s => s.review_status === 'pending');

        const mappedQueue: QueueItem[] = rawPending.map((scr: any) => {
          const lg = scr.left_eye?.dr_grade ?? -1;
          const rg = scr.right_eye?.dr_grade ?? -1;
          const maxGrade = Math.max(lg, rg);
          const urgency = maxGrade >= 3 ? 'coral' : maxGrade === 2 ? 'amber' : 'mint';
          const dateStr = scr.created_at
            ? new Date(scr.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Recent';

          const confVal = scr.left_eye?.confidence_calibrated 
            ?? scr.right_eye?.confidence_calibrated 
            ?? scr.left_eye?.confidence_raw 
            ?? scr.right_eye?.confidence_raw 
            ?? 0.92;

          return {
            patient: scr.patient_name || 'Patient',
            screeningId: scr.screening_id || scr.id,
            date: dateStr,
            leftGrade: lg >= 0 ? {
              grade: lg,
              label: `G${lg}`,
              description: scr.left_eye?.dr_grade_name || `Grade ${lg}`
            } : undefined as any,
            rightGrade: rg >= 0 ? {
              grade: rg,
              label: `G${rg}`,
              description: scr.right_eye?.dr_grade_name || `Grade ${rg}`
            } : undefined as any,
            confidence: `${(confVal * 100).toFixed(1)}%`,
            urgency
          };
        });

        setQueueItems(mappedQueue);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isDoctor]);

  const handleOpenScreening = async (screeningId: string, patientName: string) => {
    reset();
    setScreeningId(screeningId);
    setPatient(screeningId, patientName);
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

  const reviewerName = React.useMemo(() => {
    const raw = user?.full_name?.trim();
    if (isDoctor || user?.role === 'doctor') {
      if (!raw || raw.toLowerCase() === 'doctor' || raw.toLowerCase() === 'doctor1' || raw === 'Dr.' || raw === 'Dr' || raw === 'Dr. Smith') {
        return 'Dr. Anita Sharma';
      }
      if (/^dr\.?\s+/i.test(raw)) {
        return raw;
      }
      return `Dr. ${raw}`;
    }
    return raw || 'Anita Sharma';
  }, [user, isDoctor]);
  const screenedCount = summary ? summary.total_screenings.toLocaleString() : (recent.length > 0 ? recent.length.toString() : '0');
  const referableCount = summary ? summary.referable_cases.toString() : (recent.filter(r => r.overall_referable).length.toString());
  const reviewDuration = summary?.average_review_time 
    ? `${summary.average_review_time.toFixed(1)}s` 
    : summary?.average_pipeline_time 
      ? `${summary.average_pipeline_time.toFixed(1)}s` 
      : '0.0s';
  const recaptureRate = summary?.recapture_rate !== undefined 
    ? `${(summary.recapture_rate * 100).toFixed(1)}%` 
    : '0.0%';

  // Dynamic Grade Distribution Chart Values from Database
  const g0 = summary?.grade_distribution?.['0'] ?? 0;
  const g1 = summary?.grade_distribution?.['1'] ?? 0;
  const g2 = summary?.grade_distribution?.['2'] ?? 0;
  const g3 = summary?.grade_distribution?.['3'] ?? 0;
  const g4 = summary?.grade_distribution?.['4'] ?? 0;
  const maxGradeVal = Math.max(g0, g1, g2, g3, g4, 1);

  const gradeDistribution = [
    { label: 'G0', value: g0, color: '#5588a8', percent: (g0 / maxGradeVal) * 100 },
    { label: 'G1', value: g1, color: '#3ba88e', percent: (g1 / maxGradeVal) * 100 },
    { label: 'G2', value: g2, color: '#d89833', percent: (g2 / maxGradeVal) * 100 },
    { label: 'G3', value: g3, color: '#e27a42', percent: (g3 / maxGradeVal) * 100 },
    { label: 'G4', value: g4, color: '#d95856', percent: (g4 / maxGradeVal) * 100 }
  ];


  const todayDateStr = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  }).toUpperCase();

  const displayRecent = React.useMemo(() => {
    if (!recent || recent.length === 0) return [];
    return recent.slice(0, 5).map(scr => {
      const lg = scr.left_eye?.dr_grade ?? -1;
      const rg = scr.right_eye?.dr_grade ?? -1;
      const maxGrade = Math.max(lg, rg);

      let decision = 'Routine follow-up';
      let decisionTone: 'good' | 'warn' | 'danger' = 'good';

      if (scr.overall_referable) {
        decision = 'Referable DR';
        decisionTone = 'danger';
      } else if (maxGrade === 1) {
        decision = 'Mild NPDR';
        decisionTone = 'warn';
      } else if (maxGrade >= 2) {
        decision = maxGrade === 2 ? 'Moderate NPDR' : maxGrade === 3 ? 'Severe NPDR' : 'Proliferative DR';
        decisionTone = maxGrade >= 3 ? 'danger' : 'warn';
      } else if (scr.status !== 'complete') {
        decision = 'Pending analysis';
        decisionTone = 'warn';
      }

      const createdDate = scr.created_at ? new Date(scr.created_at) : new Date();
      const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        patient: scr.patient_name || 'Patient',
        screeningId: scr.screening_id || (scr as any).id,
        decision,
        decisionTone,
        time: timeStr
      };
    });
  }, [recent]);

  return (
    <>
      {/* Greeting Section — always visible instantly */}
      <section className="greeting-section">
        <div>
          <div className="greeting-eyebrow">{todayDateStr}</div>
          <h1 className="greeting-title">Good morning, {reviewerName.replace(/\.+$/, '')}.</h1>
          <p className="greeting-sub">Here's the triage picture from Jorhat Community Clinic today.</p>
        </div>

        <button 
          className="btn-start-screening" 
          onClick={() => nav('/screening/new')}
          title="Start new screening"
        >
          <Plus size={18} strokeWidth={2.5}/>
          <span>Start new screening →</span>
        </button>
      </section>

      {/* Summary Metric Cards — skeleton while loading, real data when ready */}
      {loading ? (
        <SkeletonStatCards />
      ) : (
      <section className="metrics-row-clinical">
        {/* Card 1 */}
        <div className="metric-card-clinical">
          <div className="metric-card-top">
            <div className="metric-icon-box" style={{ background: '#eaf3f9', color: '#27627f' }}>
              <Users size={20} />
            </div>
            <span className="metric-trend-tag">
              <TrendingDown size={13} style={{ transform: 'rotate(45deg)' }} /> Live
            </span>
          </div>
          <div className="metric-value-display">{screenedCount}</div>
          <div className="metric-label-display">Patients screened</div>
          <div className="metric-sub-display">Total database screenings</div>
        </div>

        {/* Card 2 */}
        <div className="metric-card-clinical">
          <div className="metric-card-top">
            <div className="metric-icon-box" style={{ background: '#faeceb', color: '#b73d44' }}>
              <AlertTriangle size={20} />
            </div>
            <span className="metric-trend-tag">
              <TrendingDown size={13} style={{ transform: 'rotate(45deg)' }} /> Action
            </span>
          </div>
          <div className="metric-value-display">{referableCount}</div>
          <div className="metric-label-display">Referable DR cases</div>
          <div className="metric-sub-display">Requiring specialist review</div>
        </div>

        {/* Card 3 */}
        <div className="metric-card-clinical">
          <div className="metric-card-top">
            <div className="metric-icon-box" style={{ background: '#fbf3e4', color: '#9a6b15' }}>
              <Clock size={20} />
            </div>
            <span className="metric-trend-tag">
              <TrendingDown size={13} style={{ transform: 'rotate(45deg)' }} /> SLA
            </span>
          </div>
          <div className="metric-value-display">{reviewDuration}</div>
          <div className="metric-label-display">Avg. review duration</div>
          <div className="metric-sub-display">under 30s SLA benchmark</div>
        </div>

        {/* Card 4 */}
        <div className="metric-card-clinical">
          <div className="metric-card-top">
            <div className="metric-icon-box" style={{ background: '#e6f5f2', color: '#1d735c' }}>
              <Activity size={20} />
            </div>
            <span className="metric-trend-tag">
              <TrendingDown size={13} style={{ transform: 'rotate(45deg)' }} /> Quality
            </span>
          </div>
          <div className="metric-value-display">{recaptureRate}</div>
          <div className="metric-label-display">Image recapture rate</div>
          <div className="metric-sub-display">Quality gate threshold</div>
        </div>
      </section>
      )}

      {/* Main Content Row: Review Queue (Left) & Grade Distribution (Right) */}
      <section className="two-col-clinical">
        {/* Left Column: Review Queue Panel */}
        <ReviewQueueSection
          items={queueItems}
          pendingCount={summary?.pending_reviews ?? queueItems.length}
          loading={loading}
          onOpenCase={(id, patient) => handleOpenScreening(id, patient)}
          onViewAll={() => nav('/review/queue')}
        />

        {/* Right Column: Grade Distribution Panel */}
        <div className="panel-clinical">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">CLINICAL SIGNAL</div>
              <h2 className="panel-title">Grade distribution</h2>
            </div>
            <button 
              className="icon-btn" 
              style={{ color: '#688284', padding: 6, borderRadius: 8, border: '1px solid #e2eceb', background: '#fafcfc' }}
              title="More options"
            >
              <MoreVertical size={16} />
            </button>
          </div>

          {/* Clean Vertical Bar Chart */}
          <div className="chart-container-vertical">
            <div className="chart-guideline" style={{ top: '25%' }} />
            <div className="chart-guideline" style={{ top: '55%' }} />
            <div className="chart-guideline" style={{ top: '85%' }} />

            {gradeDistribution.map((item, idx) => (
              <div key={idx} className="chart-bar-column">
                <span className="chart-bar-value">{item.value}</span>
                <div 
                  className="chart-bar-fill" 
                  style={{ 
                    height: `${item.percent}%`, 
                    backgroundColor: item.color 
                  }} 
                />
                <span className="chart-bar-label">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="chart-legend-row">
            <div className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: '#5588a8' }} />
              <span>No DR</span>
            </div>
            <div className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: '#d89833' }} />
              <span>Referable</span>
            </div>
            <div className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: '#d95856' }} />
              <span>Severe</span>
            </div>
          </div>
        </div>
      </section>

      {/* Lower Dashboard Section: Recent Screenings */}
      <section className="panel-clinical" style={{ marginBottom: 32 }}>
        <div className="panel-header">
          <div>
            <div className="panel-eyebrow">LIVE DATABASE</div>
            <h2 className="panel-title">Recent screenings</h2>
          </div>
          <button 
            className="panel-action-link"
            onClick={() => nav('/history')}
            style={{ border: '1px solid #dce8e7', background: '#f8fbfb', padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}
          >
            <Filter size={14} style={{ color: 'var(--clinical-teal)' }} />
            <span>View all</span>
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="recent-table-clinical">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '25%' }}>Patient</th>
                <th style={{ textAlign: 'left', width: '22%' }}>Screening ID</th>
                <th style={{ textAlign: 'left', width: '25%' }}>AI decision</th>
                <th style={{ textAlign: 'left', width: '15%' }}>Time</th>
                <th style={{ textAlign: 'right', width: '13%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRecent.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: '#688285' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#132b2e', marginBottom: 6 }}>
                      No screening records logged yet
                    </div>
                    <div style={{ fontSize: 13 }}>Click "Start new screening" above to perform an automated fundus assessment.</div>
                  </td>
                </tr>
              ) : (
                displayRecent.map((row, idx) => (
                  <tr 
                    key={idx}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleOpenScreening(row.screeningId, row.patient)}
                  >
                    <td>
                      <div className="recent-patient-name">{row.patient}</div>
                    </td>
                    <td>
                      <span className="recent-screening-id">{row.screeningId}</span>
                    </td>
                    <td>
                      <span 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-body)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: row.decisionTone === 'danger' ? '#b73d44' : row.decisionTone === 'warn' ? '#9a6b15' : '#1d735c',
                          background: row.decisionTone === 'danger' ? '#fceced' : row.decisionTone === 'warn' ? '#fcf4df' : '#e9f6f0',
                          padding: '4px 9px',
                          borderRadius: 999,
                          border: '1px solid transparent',
                          borderColor: row.decisionTone === 'danger' ? '#f2cfd2' : row.decisionTone === 'warn' ? '#f0dfb4' : '#c8eadc'
                        }}
                      >
                        <span style={{ 
                          width: 6, 
                          height: 6, 
                          borderRadius: '50%', 
                          background: row.decisionTone === 'danger' ? '#b73d44' : row.decisionTone === 'warn' ? '#9a6b15' : '#1d735c' 
                        }} />
                        {row.decision}
                      </span>
                    </td>
                    <td>
                      <span className="recent-time">{row.time}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="queue-arrow-btn"
                        style={{ display: 'inline-grid', marginLeft: 'auto' }}
                        title="Open screening"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>

  );
}
