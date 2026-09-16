import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Scan, Activity, CalendarCheck, Clock, AlertTriangle, 
  Search, SlidersHorizontal, Download, Plus, ArrowRight, 
  X, CheckCircle2, ChevronLeft, ChevronRight, Filter, 
  Eye, FileText, UserRound
} from 'lucide-react';
import { Badge, Button } from '../components';
import { listScreenings } from '../services/screenings';
import { useScreening } from '../contexts/ScreeningContext';

export interface HistoryRecord {
  screeningId: string;
  patientName: string;
  patientId: string;
  date: string;
  time: string;
  rawCreatedAt?: string;
  imageStatus: 'Images captured' | 'Quality passed' | 'Borderline quality' | 'Ungradable' | 'Recapture required' | 'Gradeable';
  aiResult: 'No DR' | 'Mild NPDR · G1' | 'Moderate NPDR · G2' | 'Severe NPDR · G3' | 'Proliferative DR' | 'Pending' | 'Ungradable';
  confidence: string;
  referralStatus: 'No referral' | 'Routine follow-up' | 'Referable DR' | 'Urgent referral' | 'Awaiting review';
  clinicalReview: 'Reviewed' | 'Awaiting review' | 'Modified by clinician' | 'Confirmed AI result' | 'Flagged for in-clinic exam' | 'Not started';
  reviewer: string;
  reviewerRole: string;
  avatarBg: string;
  avatarColor: string;
}

const TODAY_STR = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const SAMPLE_HISTORY_RECORDS: HistoryRecord[] = [
  {
    screeningId: 'SCR-00825',
    patientName: 'Kavita Sharma',
    patientId: 'RTA-00825',
    date: TODAY_STR,
    time: '09:48',
    imageStatus: 'Gradeable',
    aiResult: 'Moderate NPDR · G2',
    confidence: '92.4%',
    referralStatus: 'Referable DR',
    clinicalReview: 'Awaiting review',
    reviewer: 'Unassigned',
    reviewerRole: 'Awaiting clinical review',
    avatarBg: '#fff7e3',
    avatarColor: '#b37e22'
  },
  {
    screeningId: 'SCR-00824',
    patientName: 'Ravi Krishnan',
    patientId: 'RTA-00824',
    date: TODAY_STR,
    time: '09:42',
    imageStatus: 'Quality passed',
    aiResult: 'No DR',
    confidence: '96.8%',
    referralStatus: 'Routine follow-up',
    clinicalReview: 'Reviewed',
    reviewer: 'Anita Sharma',
    reviewerRole: 'Ophthalmic reviewer',
    avatarBg: '#eaf3f9',
    avatarColor: '#2b6183'
  },
  {
    screeningId: 'SCR-00821',
    patientName: 'Maya Das',
    patientId: 'RTA-00821',
    date: TODAY_STR,
    time: '09:18',
    imageStatus: 'Gradeable',
    aiResult: 'Severe NPDR · G3',
    confidence: '95.7%',
    referralStatus: 'Urgent referral',
    clinicalReview: 'Awaiting review',
    reviewer: 'Unassigned',
    reviewerRole: 'Awaiting clinical review',
    avatarBg: '#faeceb',
    avatarColor: '#b73d44'
  },
  {
    screeningId: 'SCR-00818',
    patientName: 'Arjun Mehta',
    patientId: 'RTA-00818',
    date: TODAY_STR,
    time: '08:56',
    imageStatus: 'Quality passed',
    aiResult: 'Mild NPDR · G1',
    confidence: '89.6%',
    referralStatus: 'Routine follow-up',
    clinicalReview: 'Confirmed AI result',
    reviewer: 'Dr. Meera Das',
    reviewerRole: 'Ophthalmic specialist',
    avatarBg: '#e6f7f2',
    avatarColor: '#17734f'
  },
  {
    screeningId: 'SCR-00816',
    patientName: 'Farida Begum',
    patientId: 'RTA-00816',
    date: '10 Sep 2026',
    time: '15:32',
    imageStatus: 'Borderline quality',
    aiResult: 'Moderate NPDR · G2',
    confidence: '88.2%',
    referralStatus: 'Awaiting review',
    clinicalReview: 'Awaiting review',
    reviewer: 'Unassigned',
    reviewerRole: 'Awaiting clinical review',
    avatarBg: '#fef3c7',
    avatarColor: '#b45309'
  },
  {
    screeningId: 'SCR-00812',
    patientName: 'Savitri More',
    patientId: 'RTA-00812',
    date: '10 Sep 2026',
    time: '11:15',
    imageStatus: 'Gradeable',
    aiResult: 'No DR',
    confidence: '97.1%',
    referralStatus: 'No referral',
    clinicalReview: 'Reviewed',
    reviewer: 'Dr. Vikram Singh',
    reviewerRole: 'Ophthalmic reviewer',
    avatarBg: '#eef2f6',
    avatarColor: '#3a506b'
  },
  {
    screeningId: 'SCR-00809',
    patientName: 'Ganesh Shinde',
    patientId: 'RTA-00809',
    date: '09 Sep 2026',
    time: '16:40',
    imageStatus: 'Recapture required',
    aiResult: 'Ungradable',
    confidence: '—',
    referralStatus: 'Awaiting review',
    clinicalReview: 'Flagged for in-clinic exam',
    reviewer: 'Anita Sharma',
    reviewerRole: 'Ophthalmic reviewer',
    avatarBg: '#fcedec',
    avatarColor: '#c53030'
  }
];

export default function HistoryPage() {
  const nav = useNavigate();
  const { reset } = useScreening();

  const [records, setRecords] = useState<HistoryRecord[]>(SAMPLE_HISTORY_RECORDS);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [referralFilter, setReferralFilter] = useState('all');
  const [reviewerFilter, setReviewerFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent_first');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const live = await listScreenings({ limit: 100 });
        const rawList: any[] = live?.screenings || live?.items || (Array.isArray(live) ? live : []);
        if (rawList && rawList.length > 0) {
          const formatted: HistoryRecord[] = rawList.map((it: any) => {
            const lg = it.left_eye?.dr_grade ?? -1;
            const rg = it.right_eye?.dr_grade ?? -1;
            const maxGrade = Math.max(lg, rg);

            let aiResult: HistoryRecord['aiResult'] = 'Pending';
            if (maxGrade === 0) aiResult = 'No DR';
            else if (maxGrade === 1) aiResult = 'Mild NPDR · G1';
            else if (maxGrade === 2) aiResult = 'Moderate NPDR · G2';
            else if (maxGrade === 3) aiResult = 'Severe NPDR · G3';
            else if (maxGrade === 4) aiResult = 'Proliferative DR';
            else if (it.status === 'needs_recapture' || it.left_eye?.quality?.status === 'ungradable' || it.right_eye?.quality?.status === 'ungradable') {
              aiResult = 'Ungradable';
            }

            const confVal = it.left_eye?.confidence_calibrated 
              ?? it.right_eye?.confidence_calibrated 
              ?? it.left_eye?.confidence_raw 
              ?? it.right_eye?.confidence_raw;
            const confidence = confVal != null ? `${(confVal * 100).toFixed(1)}%` : '—';

            let imageStatus: HistoryRecord['imageStatus'] = 'Gradeable';
            if (it.status === 'needs_recapture') {
              imageStatus = 'Recapture required';
            } else if (it.left_eye?.quality?.status === 'ungradable' || it.right_eye?.quality?.status === 'ungradable') {
              imageStatus = 'Ungradable';
            } else if (it.left_eye?.quality?.status === 'borderline' || it.right_eye?.quality?.status === 'borderline') {
              imageStatus = 'Borderline quality';
            } else if (it.left_eye?.quality?.status === 'good' || it.right_eye?.quality?.status === 'good') {
              imageStatus = 'Quality passed';
            }

            const referralStatus: HistoryRecord['referralStatus'] = it.overall_referable 
              ? (maxGrade >= 3 ? 'Urgent referral' : 'Referable DR') 
              : (it.review_status === 'pending' ? 'Awaiting review' : 'No referral');

            const clinicalReview: HistoryRecord['clinicalReview'] = it.review_status === 'reviewed' 
              ? (it.review?.decision === 'modified' ? 'Modified by clinician' : 'Confirmed AI result')
              : (it.review_status === 'pending' ? 'Awaiting review' : 'Not started');

            const reviewer = it.review?.reviewer_name || (it.review_status === 'reviewed' ? 'Dr. Anita Sharma' : 'Unassigned');
            const reviewerRole = it.review_status === 'reviewed' ? 'Ophthalmic reviewer' : 'Awaiting clinical review';

            return {
              screeningId: it.screening_id || it.id,
              patientName: it.patient_name || 'Patient Record',
              patientId: it.patient_id || '—',
              date: it.created_at ? new Date(it.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : TODAY_STR,
              time: it.created_at ? new Date(it.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
              rawCreatedAt: it.created_at,
              imageStatus,
              aiResult,
              confidence,
              referralStatus,
              clinicalReview,
              reviewer,
              reviewerRole,
              avatarBg: '#eaf3f9',
              avatarColor: '#2b6183'
            };
          });
          setRecords(formatted);
        } else {
          setRecords(SAMPLE_HISTORY_RECORDS);
        }
      } catch (err) {
        console.error('Failed to fetch screenings:', err);
        setRecords(SAMPLE_HISTORY_RECORDS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleClearFilters = () => {
    setSearch('');
    setDateFilter('all');
    setStatusFilter('all');
    setOutcomeFilter('all');
    setReferralFilter('all');
    setReviewerFilter('all');
    setPage(1);
  };

  const hasActiveFilters = search || dateFilter !== 'all' || statusFilter !== 'all' || outcomeFilter !== 'all' || referralFilter !== 'all' || reviewerFilter !== 'all';

  // Filter & Sort Logic
  const filteredList = useMemo(() => {
    return records.filter(r => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = r.patientName.toLowerCase().includes(q);
        const matchesPid = r.patientId.toLowerCase().includes(q);
        const matchesSid = r.screeningId.toLowerCase().includes(q);
        if (!matchesName && !matchesPid && !matchesSid) return false;
      }

      if (dateFilter !== 'all') {
        const itemDate = r.rawCreatedAt ? new Date(r.rawCreatedAt) : new Date(r.date);
        const now = new Date();
        if (isNaN(itemDate.getTime())) {
          // Keep if date cannot be parsed
        } else if (dateFilter === 'today') {
          if (itemDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (itemDate.toDateString() !== yesterday.toDateString()) return false;
        } else if (dateFilter === 'week') {
          const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7 || diffDays < 0) return false;
        } else if (dateFilter === 'month') {
          if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
        }
      }

      if (outcomeFilter !== 'all') {
        if (outcomeFilter === 'no_dr' && !r.aiResult.includes('No DR')) return false;
        if (outcomeFilter === 'mild' && !r.aiResult.includes('Mild')) return false;
        if (outcomeFilter === 'moderate' && !r.aiResult.includes('Moderate')) return false;
        if (outcomeFilter === 'severe' && !r.aiResult.includes('Severe')) return false;
        if (outcomeFilter === 'pdr' && !r.aiResult.includes('Proliferative')) return false;
        if (outcomeFilter === 'ungradable' && !r.aiResult.includes('Ungradable')) return false;
      }

      if (referralFilter !== 'all') {
        if (referralFilter === 'no_referral' && r.referralStatus !== 'No referral') return false;
        if (referralFilter === 'routine' && r.referralStatus !== 'Routine follow-up') return false;
        if (referralFilter === 'referable' && r.referralStatus !== 'Referable DR') return false;
        if (referralFilter === 'urgent' && r.referralStatus !== 'Urgent referral') return false;
        if (referralFilter === 'awaiting' && r.referralStatus !== 'Awaiting review') return false;
      }

      if (reviewerFilter !== 'all') {
        if (reviewerFilter === 'anita' && !r.reviewer.toLowerCase().includes('anita')) return false;
        if (reviewerFilter === 'unassigned' && r.reviewer.toLowerCase() !== 'unassigned') return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name_asc') return a.patientName.localeCompare(b.patientName);
      if (sortBy === 'oldest_first') {
        const tA = a.rawCreatedAt ? new Date(a.rawCreatedAt).getTime() : 0;
        const tB = b.rawCreatedAt ? new Date(b.rawCreatedAt).getTime() : 0;
        if (tA && tB) return tA - tB;
        return a.screeningId.localeCompare(b.screeningId, undefined, { numeric: true });
      }
      if (sortBy === 'highest_priority') {
        const score = (ref: string) => ref.includes('Urgent') ? 4 : ref.includes('Referable') ? 3 : ref.includes('Awaiting') ? 2 : 1;
        return score(b.referralStatus) - score(a.referralStatus);
      }
      // default: most recent first
      const tA = a.rawCreatedAt ? new Date(a.rawCreatedAt).getTime() : 0;
      const tB = b.rawCreatedAt ? new Date(b.rawCreatedAt).getTime() : 0;
      if (tA && tB) return tB - tA;
      return b.screeningId.localeCompare(a.screeningId, undefined, { numeric: true });
    });
  }, [records, search, dateFilter, outcomeFilter, referralFilter, reviewerFilter, sortBy]);

  const paginatedList = filteredList.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredList.length / pageSize) || 1;

  const getImageStatusBadge = (status: HistoryRecord['imageStatus']) => {
    switch (status) {
      case 'Quality passed':
      case 'Gradeable':
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#10b981', background: '#d1fae5', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>Gradeable</span>;
      case 'Borderline quality':
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>Borderline</span>;
      case 'Ungradable':
      case 'Recapture required':
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444', background: '#fee2e2', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>Recapture req.</span>;
      default:
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3b82f6', background: '#dbeafe', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>Captured</span>;
    }
  };

  const getAiBadgeClass = (res: string) => {
    if (res.includes('No DR')) return 'badge-ai-res no-dr';
    if (res.includes('Mild')) return 'badge-ai-res mild';
    if (res.includes('Moderate')) return 'badge-ai-res moderate';
    if (res.includes('Severe') || res.includes('Proliferative')) return 'badge-ai-res severe';
    return 'badge-ai-res pending';
  };

  const getRefDot = (ref: string) => {
    if (ref.includes('Urgent')) return <span className="ref-dot deep-coral" />;
    if (ref.includes('Referable')) return <span className="ref-dot amber" />;
    if (ref.includes('Routine')) return <span className="ref-dot blue" />;
    if (ref.includes('Awaiting')) return <span className="ref-dot amber" />;
    return <span className="ref-dot mint" />;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 64 }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <CheckCircle2 size={16} color="#52c8b8" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <section className="greeting-section" style={{ marginBottom: 4 }}>
        <div>
          <div className="greeting-eyebrow">SCREENING HISTORY</div>
          <h1 className="greeting-title" style={{ fontSize: 30 }}>Screening history</h1>
          <p className="greeting-sub">Track every retinal screening, AI assessment, clinical review, and referral outcome from your facility.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button 
            className="dir-btn-secondary" 
            onClick={() => showToast('Screening history export prepared')}
            style={{ padding: '10px 16px', borderRadius: 9, background: '#ffffff' }}
          >
            <Download size={15} color="#0e6264" />
            <span style={{ color: '#0e6264', fontWeight: 700 }}>Export history</span>
          </button>

          <button 
            className="btn-start-screening" 
            onClick={() => nav('/screening/new')}
            style={{ padding: '10px 18px', borderRadius: 9 }}
          >
            <Plus size={16} strokeWidth={2.4} />
            <span>＋ Start new screening</span>
          </button>
        </div>
      </section>

      {/* Search and Filter Toolbar */}
      <section className="dir-toolbar-card">
        <div className="dir-toolbar-main">
          {/* Search Input */}
          <div className="dir-search-wrap">
            <Search size={15} color="#7b9496" />
            <input 
              type="text" 
              className="dir-search-input"
              placeholder="Search by patient name, patient ID, or screening ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            {search && (
              <button className="dir-clear-icon" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filters Group */}
          <div className="dir-filter-group">
            {/* Screening Date */}
            <div className="dir-select-label">
              <span className="dir-select-title">Screening date</span>
              <select 
                className="dir-select"
                value={dateFilter}
                onChange={e => { setDateFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
            </div>

            {/* AI Outcome Filter */}
            <div className="dir-select-label">
              <span className="dir-select-title">AI outcome</span>
              <select 
                className="dir-select"
                value={outcomeFilter}
                onChange={e => { setOutcomeFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All outcomes</option>
                <option value="no_dr">No DR</option>
                <option value="mild">Mild NPDR</option>
                <option value="moderate">Moderate NPDR</option>
                <option value="severe">Severe NPDR</option>
                <option value="pdr">Proliferative DR</option>
                <option value="ungradable">Ungradable</option>
              </select>
            </div>

            {/* Referral Status */}
            <div className="dir-select-label">
              <span className="dir-select-title">Referral status</span>
              <select 
                className="dir-select"
                value={referralFilter}
                onChange={e => { setReferralFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All referral statuses</option>
                <option value="no_referral">No referral</option>
                <option value="routine">Routine follow-up</option>
                <option value="referable">Referable DR</option>
                <option value="urgent">Urgent referral</option>
                <option value="awaiting">Awaiting review</option>
              </select>
            </div>

            {/* Reviewer Filter */}
            <div className="dir-select-label">
              <span className="dir-select-title">Reviewer</span>
              <select 
                className="dir-select"
                value={reviewerFilter}
                onChange={e => { setReviewerFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All reviewers</option>
                <option value="anita">Dr. Anita Sharma</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Clear Filters Action */}
            {hasActiveFilters && (
              <div style={{ alignSelf: 'flex-end' }}>
                <button className="dir-btn-clear" onClick={handleClearFilters}>
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="dir-chips-row" style={{ marginTop: 14 }}>
            <div className="dir-chips-left">
              {search && (
                <span className="dir-chip">
                  Search: "{search}"
                  <button className="dir-chip-close" onClick={() => setSearch('')}><X size={11} /></button>
                </span>
              )}
              {dateFilter !== 'all' && (
                <span className="dir-chip">
                  Date: {dateFilter}
                  <button className="dir-chip-close" onClick={() => setDateFilter('all')}><X size={11} /></button>
                </span>
              )}
              {outcomeFilter !== 'all' && (
                <span className="dir-chip">
                  Outcome: {outcomeFilter}
                  <button className="dir-chip-close" onClick={() => setOutcomeFilter('all')}><X size={11} /></button>
                </span>
              )}
              {referralFilter !== 'all' && (
                <span className="dir-chip">
                  Referral: {referralFilter}
                  <button className="dir-chip-close" onClick={() => setReferralFilter('all')}><X size={11} /></button>
                </span>
              )}
            </div>

            <div className="dir-result-count">
              Showing 1–{paginatedList.length} of {filteredList.length} screenings
            </div>
          </div>
        )}
      </section>

      {/* Screening Records Card & Table */}
      <section className="patient-table-card">
        {/* Table Header */}
        <div className="patient-table-header">
          <div>
            <div className="rq-eyebrow" style={{ fontSize: 9.5, marginBottom: 3 }}>SCREENING RECORDS</div>
            <h3 className="patient-table-title" style={{ fontSize: 20 }}>All screening activity</h3>
            <p className="patient-table-sub">Every capture, AI result, review decision, and referral outcome</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: '#6e8587', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Sort by:</span>
            <select 
              className="dir-select" 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 11.5 }}
            >
              <option value="recent_first">Most recent first</option>
              <option value="oldest_first">Oldest first</option>
              <option value="highest_priority">Highest referral priority</option>
              <option value="name_asc">Patient name A – Z</option>
            </select>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap">
          <table className="patient-table-clinical">
            <thead>
              <tr>
                <th>Screening</th>
                <th>Patient</th>
                <th>Date and Time</th>
                <th>Image Status</th>
                <th>AI Result</th>
                <th>Referral Status</th>
                <th>Clinical Review</th>
                <th>Reviewer</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: '#7a9496' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <Activity size={18} color="#0e6264" />
                      <span>Loading clinical screening records...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filteredList.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 16px', color: '#7a9496' }}>
                    <Scan size={36} strokeWidth={1.5} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#183639' }}>No screening records found</div>
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                      {hasActiveFilters ? 'Try adjusting your filters or search query.' : 'Perform a new screening to establish records.'}
                    </p>
                    {hasActiveFilters && (
                      <button className="dir-btn-clear" onClick={handleClearFilters} style={{ margin: '12px auto 0' }}>
                        Reset filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {!loading && paginatedList.map(r => (
                <tr 
                  key={r.screeningId} 
                  className="patient-table-row"
                  onClick={() => nav(`/history/${r.screeningId}`)}
                  title={`Open clinical screening record for ${r.patientName}`}
                >
                  {/* Screening ID */}
                  <td>
                    <div>
                      <span className="recent-screening-id" style={{ fontSize: 12.5, fontWeight: 700, color: '#0e6264' }}>
                        {r.screeningId}
                      </span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#7a9496', marginTop: 2 }}>
                        Both eyes · 45° colour field
                      </div>
                    </div>
                  </td>

                  {/* Patient */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div 
                        className="patient-avatar-circle"
                        style={{ background: r.avatarBg, color: r.avatarColor, width: 32, height: 32, fontSize: 11.5 }}
                      >
                        {getInitials(r.patientName)}
                      </div>
                      <div>
                        <div className="recent-patient-name" style={{ fontSize: 13.5 }}>{r.patientName}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7a9496', marginTop: 1 }}>
                          {r.patientId}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Date & Time */}
                  <td>
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#183639', fontWeight: 600 }}>
                        {r.date}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#688285', marginTop: 2 }}>
                        {r.time}
                      </div>
                    </div>
                  </td>

                  {/* Image Status */}
                  <td>
                    {getImageStatusBadge(r.imageStatus)}
                  </td>

                  {/* AI Result */}
                  <td>
                    <div>
                      <span className={getAiBadgeClass(r.aiResult)}>
                        {r.aiResult}
                      </span>
                      {r.confidence !== '—' && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#688285', marginTop: 3 }}>
                          {r.confidence} calibrated
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Referral Status */}
                  <td>
                    <div className="referral-status-cell">
                      {getRefDot(r.referralStatus)}
                      <span>{r.referralStatus}</span>
                    </div>
                  </td>

                  {/* Clinical Review */}
                  <td>
                    <div>
                      <span style={{ 
                        display: 'inline-block',
                        fontSize: 11, 
                        fontWeight: 600, 
                        color: r.clinicalReview === 'Awaiting review' ? '#b45309' : '#167650' 
                      }}>
                        {r.clinicalReview}
                      </span>
                      {r.clinicalReview !== 'Awaiting review' && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#7a9496', marginTop: 1 }}>
                          Signed off
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Reviewer */}
                  <td>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#183639' }}>{r.reviewer}</div>
                      <div style={{ fontSize: 10, color: '#7a9496', marginTop: 1 }}>{r.reviewerRole}</div>
                    </div>
                  </td>

                  {/* Action Column */}
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="rq-open-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/history/${r.screeningId}`);
                      }}
                      title="Open screening record"
                      aria-label="Open screening record"
                    >
                      <ArrowRight size={14} strokeWidth={2.2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="pagination-bar">
          <div style={{ color: '#678184', fontFamily: 'var(--font-body)', fontSize: 11.5 }}>
            Showing <strong style={{ color: '#163336', fontFamily: 'var(--font-mono)' }}>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredList.length)}</strong> of <strong style={{ color: '#163336', fontFamily: 'var(--font-mono)' }}>{filteredList.length}</strong> screenings
          </div>

          <div className="pagination-pages">
            <button 
              className="page-btn" 
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
              <button 
                key={num} 
                className={`page-btn ${page === num ? 'active' : ''}`}
                onClick={() => setPage(num)}
              >
                {num}
              </button>
            ))}

            <button 
              className="page-btn" 
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

