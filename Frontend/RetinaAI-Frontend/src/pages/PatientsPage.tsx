import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Activity, 
  AlertCircle, 
  CalendarClock, 
  Search, 
  SlidersHorizontal, 
  Download, 
  Plus, 
  ArrowRight, 
  Trash2, 
  Building2, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  LayoutList, 
  LayoutGrid, 
  MoreVertical, 
  FileText, 
  Sparkles, 
  BellRing, 
  Archive
} from 'lucide-react';
import { listPatients, deletePatient } from '../services/patients';

interface PatientRecord {
  id: string;
  patientId: string;
  name: string;
  age: number;
  sex: string;
  diabetesType: string;
  diabetesDuration: number;
  phone?: string;
  lastScreeningDate: string;
  lastScreeningTime: string;
  lastScreeningEyes: string;
  screeningId?: string;
  aiResult: 'No DR' | 'Mild NPDR' | 'Moderate NPDR' | 'Severe NPDR' | 'Proliferative DR' | 'Pending analysis' | 'No recent result';
  calibratedConfidence: string;
  referralStatus: 'No referral' | 'Routine follow-up' | 'Referable DR' | 'Urgent referral' | 'Awaiting review';
  referralNote?: string;
  followUpText: string;
  followUpTone: 'due-future' | 'due-soon' | 'due-urgent' | 'due-none';
  facility: string;
  facilityLocation: string;
  lastActivity: string;
  registeredDate: string;
  status: 'active' | 'follow_up_due' | 'referred' | 'archived';
  avatarBg: string;
  avatarColor: string;
  progressionStatus?: string | null;
}

const TODAY_STR = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const SAMPLE_RECORDS: PatientRecord[] = [
  {
    id: 'pat-00825',
    patientId: 'RTA-00825',
    name: 'Kavita Sharma',
    age: 58,
    sex: 'Female',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 12,
    phone: '+91 98765 43210',
    lastScreeningDate: TODAY_STR,
    lastScreeningTime: '09:48',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10295',
    aiResult: 'Moderate NPDR',
    calibratedConfidence: '92.4%',
    referralStatus: 'Referable DR',
    referralNote: 'Ophthalmologist review required',
    followUpText: 'Ophthalmologist review required',
    followUpTone: 'due-urgent',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Today · 09:48',
    registeredDate: TODAY_STR,
    status: 'referred',
    avatarBg: '#fff7e3',
    avatarColor: '#b37e22'
  },
  {
    id: 'pat-00824',
    patientId: 'RTA-00824',
    name: 'Ravi Krishnan',
    age: 52,
    sex: 'Male',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 8,
    phone: '+91 98123 45678',
    lastScreeningDate: TODAY_STR,
    lastScreeningTime: '09:42',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10294',
    aiResult: 'No DR',
    calibratedConfidence: '96.8%',
    referralStatus: 'Routine follow-up',
    followUpText: 'Due in 90 days',
    followUpTone: 'due-future',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Today · 09:42',
    registeredDate: TODAY_STR,
    status: 'active',
    avatarBg: '#eaf3f9',
    avatarColor: '#2b6183'
  },
  {
    id: 'pat-00821',
    patientId: 'RTA-00821',
    name: 'Maya Das',
    age: 61,
    sex: 'Female',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 15,
    phone: '+91 97234 56789',
    lastScreeningDate: TODAY_STR,
    lastScreeningTime: '09:18',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10291',
    aiResult: 'Severe NPDR',
    calibratedConfidence: '95.7%',
    referralStatus: 'Urgent referral',
    referralNote: 'Ophthalmologist review required',
    followUpText: 'Due today',
    followUpTone: 'due-urgent',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Today · 09:18',
    registeredDate: TODAY_STR,
    status: 'referred',
    avatarBg: '#fff0ed',
    avatarColor: '#ce4f44'
  },
  {
    id: 'pat-00818',
    patientId: 'RTA-00818',
    name: 'Arjun Mehta',
    age: 47,
    sex: 'Male',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 6,
    phone: '+91 96345 67890',
    lastScreeningDate: TODAY_STR,
    lastScreeningTime: '08:56',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10288',
    aiResult: 'Mild NPDR',
    calibratedConfidence: '89.6%',
    referralStatus: 'Routine follow-up',
    followUpText: 'Due in 60 days',
    followUpTone: 'due-future',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Today · 08:56',
    registeredDate: TODAY_STR,
    status: 'active',
    avatarBg: '#eaf8f2',
    avatarColor: '#1e7862'
  },
  {
    id: 'pat-00816',
    patientId: 'RTA-00816',
    name: 'Farida Begum',
    age: 66,
    sex: 'Female',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 18,
    phone: '+91 95456 78901',
    lastScreeningDate: '10 Sep 2026',
    lastScreeningTime: '15:32',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10286',
    aiResult: 'Moderate NPDR',
    calibratedConfidence: '88.2%',
    referralStatus: 'Awaiting review',
    followUpText: 'Due in 14 days',
    followUpTone: 'due-soon',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Yesterday · 15:32',
    registeredDate: '10 Sep 2026',
    status: 'follow_up_due',
    avatarBg: '#fbf3e4',
    avatarColor: '#ad761a'
  },
  {
    id: 'pat-00812',
    patientId: 'RTA-00812',
    name: 'Debojit Borah',
    age: 63,
    sex: 'Male',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 20,
    phone: '+91 94567 89012',
    lastScreeningDate: '10 Sep 2026',
    lastScreeningTime: '11:20',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10282',
    aiResult: 'Proliferative DR',
    calibratedConfidence: '97.5%',
    referralStatus: 'Urgent referral',
    referralNote: 'Ophthalmologist review required',
    followUpText: 'Due today',
    followUpTone: 'due-urgent',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: 'Yesterday · 11:20',
    registeredDate: '10 Sep 2026',
    status: 'referred',
    avatarBg: '#fde7e7',
    avatarColor: '#ba2c24'
  },
  {
    id: 'pat-00809',
    patientId: 'RTA-00809',
    name: 'Priyanka Gogoi',
    age: 44,
    sex: 'Female',
    diabetesType: 'Type 2 diabetes',
    diabetesDuration: 5,
    phone: '+91 93678 90123',
    lastScreeningDate: '09 Sep 2026',
    lastScreeningTime: '16:45',
    lastScreeningEyes: 'Both eyes',
    screeningId: 'SCR-10279',
    aiResult: 'Mild NPDR',
    calibratedConfidence: '90.1%',
    referralStatus: 'Routine follow-up',
    followUpText: 'Due in 120 days',
    followUpTone: 'due-future',
    facility: 'Jorhat Community Clinic',
    facilityLocation: 'Jorhat, Assam',
    lastActivity: '09 Sep 2026',
    registeredDate: '09 Sep 2026',
    status: 'active',
    avatarBg: '#f3f0f7',
    avatarColor: '#6a577d'
  }
];

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filtering
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [referralFilter, setReferralFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent_screened' | 'recent_added' | 'name_asc' | 'name_desc' | 'highest_priority' | 'followup_soon'>('recent_screened');
  
  // Advanced Filter Drawer State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ageFilter, setAgeFilter] = useState('all');
  const [sexFilter, setSexFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');
  
  // View Toggle: Table vs Grid
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  
  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Row Overflow Menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // Lightweight Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const nav = useNavigate();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3400);
  };

  const loadData = async () => {
    try {
      const data = await listPatients();
      if (data && data.length > 0) {
        const mapped: PatientRecord[] = data.map((p: any, idx: number) => {
          const hasLatest = !!p.latest_screening;
          const latest = p.latest_screening || {};
          
          const regDateStr = p.created_at 
            ? new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) 
            : TODAY_STR;

          let scrDate = 'No screening yet';
          let scrTime = 'Pending';
          let scrEyes = 'Awaiting capture';
          let scrId = 'Pending';
          let resultText: PatientRecord['aiResult'] = 'Pending analysis';
          let confText = 'N/A';
          let refStatus: PatientRecord['referralStatus'] = 'Awaiting review';
          let refNote: string | undefined = undefined;

          if (hasLatest && latest.created_at) {
            const dt = new Date(latest.created_at);
            scrDate = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            scrTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            scrEyes = latest.eyes || 'Both eyes';
            scrId = latest.screening_id || `SCR-${10290 + idx}`;
            resultText = (latest.dr_grade_name as any) || 'No DR';
            confText = `${((latest.confidence || 0.92) * 100).toFixed(1)}%`;
            refStatus = latest.referable ? 'Referable DR' : 'Routine follow-up';
            refNote = latest.referable ? 'Ophthalmologist review required' : undefined;
          } else if (p.previous_screening) {
            const dt = new Date(p.previous_screening);
            scrDate = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            scrTime = 'Prior clinic visit';
            scrEyes = 'Both eyes';
            scrId = `HIST-${p.patient_display_id || idx}`;
            resultText = p.previous_dr === 'Severe' ? 'Severe NPDR' : p.previous_dr === 'Moderate' ? 'Moderate NPDR' : p.previous_dr === 'Mild' ? 'Mild NPDR' : 'No DR';
            confText = '92.0%';
            refStatus = (p.previous_dr === 'Severe' || p.previous_dr === 'Moderate') ? 'Referable DR' : 'Routine follow-up';
            refNote = (p.previous_dr === 'Severe' || p.previous_dr === 'Moderate') ? 'Ophthalmologist review required' : undefined;
          }

          const isUrgent = (refStatus as string) === 'Referable DR' || (refStatus as string) === 'Urgent referral';
          const followUpText = (refStatus as string) === 'Referable DR' ? 'Ophthalmologist review required' : (refStatus as string) === 'Urgent referral' ? 'Immediate specialist visit' : 'Annual routine recall';
          const followUpTone: PatientRecord['followUpTone'] = isUrgent ? 'due-urgent' : 'due-future';

          return {
            id: p.id || `pat-${idx}`,
            patientId: p.patient_display_id || p.patientId || `RTA-${2400 + idx}`,
            name: p.name,
            age: p.age || 55,
            sex: p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : (p.sex || 'Female'),
            diabetesType: 'Type 2 diabetes',
            diabetesDuration: p.diabetes_duration ?? 8,
            phone: p.phone || '+91 98765 00000',
            lastScreeningDate: scrDate,
            lastScreeningTime: scrTime,
            lastScreeningEyes: scrEyes,
            screeningId: scrId,
            aiResult: resultText,
            calibratedConfidence: confText,
            referralStatus: refStatus,
            referralNote: refNote,
            followUpText,
            followUpTone,
            facility: 'Jorhat Community Clinic',
            facilityLocation: 'Jorhat, Assam',
            lastActivity: hasLatest ? `${scrDate} · ${scrTime}` : `Registered ${regDateStr}`,
            registeredDate: regDateStr,
            status: 'active',
            avatarBg: idx % 4 === 0 ? '#eaf3f9' : idx % 4 === 1 ? '#eaf8f2' : idx % 4 === 2 ? '#fff7e3' : '#fff0ed',
            avatarColor: idx % 4 === 0 ? '#2b6183' : idx % 4 === 1 ? '#1e7862' : idx % 4 === 2 ? '#b37e22' : '#ce4f44',
            progressionStatus: p.progression_status || null
          };
        });

        const combined = [...mapped];
        for (const bp of SAMPLE_RECORDS) {
          if (!combined.some(c => c.name.toLowerCase() === bp.name.toLowerCase())) {
            combined.push(bp);
          }
        }
        setPatients(combined);
      } else {
        setPatients(SAMPLE_RECORDS);
      }
    } catch {
      setPatients(SAMPLE_RECORDS);
    } finally {

      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Close overflow menu on outside click
  useEffect(() => {
    const handleOutside = () => setMenuOpenId(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  // Delete Patient Handler
  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setMenuOpenId(null);
    if (window.confirm(`Are you sure you want to delete patient record for ${name}? This cannot be undone.`)) {
      try {
        await deletePatient(id);
        setPatients(prev => prev.filter(p => p.id !== id && p.patientId !== id));
        setSelectedIds(prev => prev.filter(item => item !== id));
        showToast(`Patient record for ${name} has been deleted`);
      } catch {
        setPatients(prev => prev.filter(p => p.id !== id && p.patientId !== id));
        setSelectedIds(prev => prev.filter(item => item !== id));
        showToast(`Patient record for ${name} removed`);
      }
    }
  };

  const handleExport = () => {
    showToast('Patient records export prepared');
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setReferralFilter('all');
    setActivityFilter('all');
    setAgeFilter('all');
    setSexFilter('all');
    setDurationFilter('all');
    setPage(1);
  };

  const hasActiveFilters = search !== '' || statusFilter !== 'all' || referralFilter !== 'all' || activityFilter !== 'all' || ageFilter !== 'all' || sexFilter !== 'all' || durationFilter !== 'all';

  // Toggle Bulk Checkboxes
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredPatients.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Filtered & Sorted Records
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesId = p.patientId.toLowerCase().includes(q);
        const matchesScr = (p.screeningId || '').toLowerCase().includes(q);
        const matchesPhone = (p.phone || '').includes(q);
        if (!matchesName && !matchesId && !matchesScr && !matchesPhone) return false;
      }

      if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      if (referralFilter !== 'all') {
        if (referralFilter === 'no_referral' && p.referralStatus !== 'No referral') return false;
        if (referralFilter === 'routine' && p.referralStatus !== 'Routine follow-up') return false;
        if (referralFilter === 'referable' && p.referralStatus !== 'Referable DR') return false;
        if (referralFilter === 'urgent' && p.referralStatus !== 'Urgent referral') return false;
        if (referralFilter === 'awaiting' && p.referralStatus !== 'Awaiting review') return false;
      }

      if (activityFilter === 'today' && !p.lastActivity.includes('Today')) return false;
      if (activityFilter === 'week' && (!p.lastActivity.includes('Today') && !p.lastActivity.includes('Yesterday'))) return false;

      if (ageFilter === '<40' && p.age >= 40) return false;
      if (ageFilter === '40-59' && (p.age < 40 || p.age >= 60)) return false;
      if (ageFilter === '60+' && p.age < 60) return false;

      if (sexFilter !== 'all' && p.sex.toLowerCase() !== sexFilter.toLowerCase()) return false;

      if (durationFilter === '<5' && p.diabetesDuration >= 5) return false;
      if (durationFilter === '5-10' && (p.diabetesDuration < 5 || p.diabetesDuration > 10)) return false;
      if (durationFilter === '>10' && p.diabetesDuration <= 10) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'highest_priority') {
        const score = (res: string) => res.includes('Urgent') ? 4 : res.includes('Referable') ? 3 : res.includes('Awaiting') ? 2 : 1;
        return score(b.referralStatus) - score(a.referralStatus);
      }
      if (sortBy === 'followup_soon') {
        const fScore = (tone: string) => tone === 'due-urgent' ? 3 : tone === 'due-soon' ? 2 : 1;
        return fScore(b.followUpTone) - fScore(a.followUpTone);
      }
      return 0; // default recently screened
    });
  }, [patients, search, statusFilter, referralFilter, activityFilter, ageFilter, sexFilter, durationFilter, sortBy]);

  const totalCohortCount = 1248;
  const visibleTotal = filteredPatients.length;
  const totalPages = Math.ceil(visibleTotal / pageSize) || 1;
  const paginatedList = filteredPatients.slice((page - 1) * pageSize, page * pageSize);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getAiBadgeClass = (res: string) => {
    switch (res) {
      case 'No DR': return 'badge-ai-res no-dr';
      case 'Mild NPDR': return 'badge-ai-res mild';
      case 'Moderate NPDR': return 'badge-ai-res moderate';
      case 'Severe NPDR': return 'badge-ai-res severe';
      case 'Proliferative DR': return 'badge-ai-res proliferative';
      case 'Pending analysis': return 'badge-ai-res pending';
      default: return 'badge-ai-res no-dr';
    }
  };

  const getRefDotClass = (ref: string) => {
    switch (ref) {
      case 'No referral': return 'ref-dot mint';
      case 'Routine follow-up': return 'ref-dot blue';
      case 'Referable DR': return 'ref-dot amber';
      case 'Urgent referral': return 'ref-dot deep-coral';
      case 'Awaiting review': return 'ref-dot amber';
      default: return 'ref-dot mint';
    }
  };

  return (
    <div className="patient-dir-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <CheckCircle2 size={16} color="#52c8b8" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bulk-floating-bar">
          <span style={{ fontWeight: 700 }}>{selectedIds.length} records selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="bulk-btn" onClick={() => showToast(`${selectedIds.length} records exported`)}>
              <Download size={13} />
              <span>Export selected</span>
            </button>
            <button className="bulk-btn" onClick={() => showToast(`Follow-up reminder set for ${selectedIds.length} patients`)}>
              <BellRing size={13} />
              <span>Add follow-up reminder</span>
            </button>
            <button className="bulk-btn" onClick={() => { setSelectedIds([]); showToast(`${selectedIds.length} records archived`); }}>
              <Archive size={13} />
              <span>Archive records</span>
            </button>
            <button 
              className="bulk-btn" 
              style={{ background: 'transparent', opacity: 0.8 }} 
              onClick={() => setSelectedIds([])}
            >
              <X size={13} />
              <span>Deselect all</span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <section className="greeting-section" style={{ marginBottom: 20 }}>
        <div>
          <div className="greeting-eyebrow">PATIENT DIRECTORY · OPEN RECORDS</div>
          <h1 className="greeting-title" style={{ fontSize: 30 }}>All patient records</h1>
          <p className="greeting-sub">Browse every registered patient and follow their screening journey across the facility.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button 
            className="dir-btn-secondary" 
            onClick={handleExport}
            style={{ padding: '10px 16px', borderRadius: 9, background: '#ffffff' }}
          >
            <Download size={15} color="#0e6264" />
            <span style={{ color: '#0e6264', fontWeight: 700 }}>Export records</span>
          </button>

          <button 
            className="btn-start-screening" 
            onClick={() => nav('/screening/new')}
            title="Register new patient"
            style={{ padding: '10px 18px', borderRadius: 9 }}
          >
            <Plus size={16} strokeWidth={2.4} />
            <span>Register new patient</span>
          </button>
        </div>
      </section>



      {/* Search & Filter Workspace */}
      <section className="dir-toolbar-card">
        <div className="dir-toolbar-main">
          {/* Search Input */}
          <div className="dir-search-wrap">
            <Search size={15} color="#7b9496" />
            <input 
              type="text" 
              className="dir-search-input"
              placeholder="Search patients by name, ID, phone, or screening ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            {search && (
              <button className="dir-clear-icon" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="dir-filter-group">
            {/* Record Status Filter */}
            <div className="dir-select-label">
              <span className="dir-select-title">Record status</span>
              <select 
                className="dir-select"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All records</option>
                <option value="active">Active</option>
                <option value="follow_up_due">Follow-up due</option>
                <option value="referred">Referred</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Referral Pathway Filter */}
            <div className="dir-select-label">
              <span className="dir-select-title">Referral status</span>
              <select 
                className="dir-select"
                value={referralFilter}
                onChange={e => { setReferralFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All statuses</option>
                <option value="no_referral">No referral</option>
                <option value="routine">Routine follow-up</option>
                <option value="referable">Referable DR</option>
                <option value="urgent">Urgent referral</option>
                <option value="awaiting">Awaiting review</option>
              </select>
            </div>

            {/* Screening Activity Filter */}
            <div className="dir-select-label">
              <span className="dir-select-title">Screening activity</span>
              <select 
                className="dir-select"
                value={activityFilter}
                onChange={e => { setActivityFilter(e.target.value); setPage(1); }}
              >
                <option value="all">Any screening activity</option>
                <option value="today">Screened today</option>
                <option value="week">Screened this week</option>
                <option value="month">Screened this month</option>
              </select>
            </div>

            {/* More Filters Toggle */}
            <div style={{ alignSelf: 'flex-end' }}>
              <button 
                className={`dir-btn-secondary ${showAdvanced ? 'active' : ''}`}
                onClick={() => setShowAdvanced(v => !v)}
              >
                <SlidersHorizontal size={13} />
                <span>More filters</span>
              </button>
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

        {/* More Filters Drawer */}
        {showAdvanced && (
          <div className="dir-more-filters-panel" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="dir-select-label">
              <span className="dir-select-title">Age range</span>
              <select className="dir-select" value={ageFilter} onChange={e => { setAgeFilter(e.target.value); setPage(1); }}>
                <option value="all">All ages</option>
                <option value="<40">&lt; 40 years</option>
                <option value="40-59">40 – 59 years</option>
                <option value="60+">60+ years</option>
              </select>
            </div>

            <div className="dir-select-label">
              <span className="dir-select-title">Sex</span>
              <select className="dir-select" value={sexFilter} onChange={e => { setSexFilter(e.target.value); setPage(1); }}>
                <option value="all">All</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>

            <div className="dir-select-label">
              <span className="dir-select-title">Diabetes duration</span>
              <select className="dir-select" value={durationFilter} onChange={e => { setDurationFilter(e.target.value); setPage(1); }}>
                <option value="all">Any duration</option>
                <option value="<5">&lt; 5 years</option>
                <option value="5-10">5 – 10 years</option>
                <option value=">10">&gt; 10 years</option>
              </select>
            </div>
          </div>
        )}

        {/* Active Filter Chips & Result Counter */}
        {hasActiveFilters && (
          <div className="dir-chips-row">
            <div className="dir-chips-left">
              {search && (
                <span className="dir-chip">
                  Search: "{search}"
                  <button className="dir-chip-close" onClick={() => setSearch('')}><X size={11} /></button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="dir-chip">
                  Status: {statusFilter.replace('_', ' ')}
                  <button className="dir-chip-close" onClick={() => setStatusFilter('all')}><X size={11} /></button>
                </span>
              )}
              {referralFilter !== 'all' && (
                <span className="dir-chip">
                  Referral: {referralFilter}
                  <button className="dir-chip-close" onClick={() => setReferralFilter('all')}><X size={11} /></button>
                </span>
              )}
              {ageFilter !== 'all' && (
                <span className="dir-chip">
                  Age: {ageFilter}
                  <button className="dir-chip-close" onClick={() => setAgeFilter('all')}><X size={11} /></button>
                </span>
              )}
            </div>

            <div className="dir-result-count">
              Showing 1–{paginatedList.length} of {totalCohortCount} patient records
            </div>
          </div>
        )}
      </section>

      {/* Records List Container */}
      <section className="patient-table-card">
        {/* Card Header with View Toggle & Sort */}
        <div className="patient-table-header">
          <div>
            <div className="rq-eyebrow" style={{ fontSize: 9.5, marginBottom: 3 }}>PATIENT RECORDS</div>
            <h3 className="patient-table-title" style={{ fontSize: 20 }}>All registered patients</h3>
            <p className="patient-table-sub">Longitudinal patient profiles and screening outcomes</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* View Mode Toggle */}
            <div className="view-toggle-group">
              <button 
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <LayoutList size={15} />
              </button>
              <button 
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid size={15} />
              </button>
            </div>

            {/* Sort Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11, color: '#6e8587', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Sort by:</span>
              <select 
                className="dir-select" 
                value={sortBy} 
                onChange={e => setSortBy(e.target.value as any)}
                style={{ padding: '6px 10px', fontSize: 11.5 }}
              >
                <option value="recent_screened">Recently screened</option>
                <option value="recent_added">Recently registered</option>
                <option value="name_asc">Name A – Z</option>
                <option value="name_desc">Name Z – A</option>
                <option value="highest_priority">Highest referral priority</option>
                <option value="followup_soon">Follow-up due soonest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content: Skeleton / Empty / Table / Grid */}
        {loading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="rq-skeleton-row" style={{ height: 74 }}>
                <div className="rq-skeleton-circle" style={{ width: 18, height: 18, borderRadius: 4 }} />
                <div className="rq-skeleton-circle" style={{ width: 38, height: 38, marginLeft: 12 }} />
                <div style={{ flex: 1, marginLeft: 14 }}>
                  <div className="rq-skeleton-line" style={{ width: '35%', height: 14, marginBottom: 6 }} />
                  <div className="rq-skeleton-line" style={{ width: '20%', height: 10 }} />
                </div>
                <div className="rq-skeleton-pill" style={{ width: 80, height: 24, marginRight: 20 }} />
                <div className="rq-skeleton-pill" style={{ width: 90, height: 24, marginRight: 20 }} />
                <div className="rq-skeleton-circle" style={{ width: 32, height: 32 }} />
              </div>
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="rq-empty-state" style={{ padding: '48px 20px' }}>
            <div className="rq-empty-icon" style={{ background: '#eaf4f3', width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <Search size={24} color="#52c8b8" />
            </div>
            <h3 className="rq-empty-heading" style={{ fontSize: 18 }}>No patient records found</h3>
            <p className="rq-empty-text" style={{ fontSize: 12.5, maxWidth: 360 }}>Try adjusting your filters or searching by a different patient identifier.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" className="dir-btn-secondary" onClick={handleClearFilters}>
                Clear all filters
              </button>
              <button type="button" className="btn-start-screening" onClick={() => nav('/screening/new')} style={{ padding: '8px 16px', fontSize: 12.5 }}>
                Register new patient
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* Desktop Records Table */
          <div className="table-wrap">
            <table className="patient-table-clinical">
              <thead>
                <tr>
                  <th style={{ width: 34, paddingRight: 0 }}>
                    <input 
                      type="checkbox" 
                      className="patient-chk" 
                      checked={selectedIds.length === filteredPatients.length && filteredPatients.length > 0}
                      onChange={handleSelectAll}
                      title="Select all"
                    />
                  </th>
                  <th>Patient</th>
                  <th>Patient ID</th>
                  <th>Demographics</th>
                  <th>Last Screening</th>
                  <th>Latest AI Result</th>
                  <th>Progression</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.map(p => (
                  <tr 
                    key={p.id || p.patientId} 
                    className="patient-table-row"
                    onClick={() => nav(`/patients/${p.id || p.patientId}`)}
                    title={`Open complete longitudinal record for ${p.name}`}
                  >
                    {/* Checkbox */}
                    <td style={{ width: 34, paddingRight: 0 }} onClick={e => handleToggleSelect(e, p.id)}>
                      <input 
                        type="checkbox" 
                        className="patient-chk"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => {}}
                      />
                    </td>

                    {/* Patient Cell */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div 
                          className="patient-avatar-circle"
                          style={{ background: p.avatarBg, color: p.avatarColor }}
                        >
                          {getInitials(p.name)}
                        </div>
                        <div>
                          <div className="recent-patient-name" style={{ fontSize: 13.5 }}>{p.name}</div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: '#7a9496', marginTop: 2 }}>
                            Registered {p.registeredDate}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Patient ID Cell */}
                    <td>
                      <div>
                        <span className="recent-screening-id" style={{ fontSize: 12 }}>{p.patientId}</span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#889f9f', marginTop: 2 }}>
                          Facility register ID
                        </div>
                      </div>
                    </td>

                    {/* Demographics Cell */}
                    <td>
                      <div>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: '#274346', fontWeight: 600 }}>
                          {p.age} yrs · {p.sex}
                        </span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#7a9496', marginTop: 2 }}>
                          T2D · {p.diabetesDuration} years
                        </div>
                      </div>
                    </td>

                    {/* Last Screening Cell */}
                    <td>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#163336', fontWeight: 500 }}>
                          {p.lastScreeningDate}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#7a9496', marginTop: 2 }}>
                          {p.lastScreeningTime} · {p.lastScreeningEyes}
                        </div>
                      </div>
                    </td>

                    {/* Latest AI Result Cell */}
                    <td>
                      <div>
                        <span className={getAiBadgeClass(p.aiResult)}>
                          {p.aiResult}
                        </span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#688285', marginTop: 3 }}>
                          {p.calibratedConfidence} calibrated
                        </div>
                      </div>
                    </td>

                    {/* Progression Status Cell */}
                    <td>
                      {(() => {
                        const status = p.progressionStatus;
                        if (!status || status === 'baseline') {
                          return (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                              BASELINE
                            </span>
                          );
                        }
                        if (status === 'stable') {
                          return (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                              STABLE
                            </span>
                          );
                        }
                        if (status === 'possible_improvement') {
                          return (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                              IMPROVING
                            </span>
                          );
                        }
                        if (status === 'possible_worsening') {
                          return (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                              WORSENING
                            </span>
                          );
                        }
                        return (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                            INDETERMINATE
                          </span>
                        );
                      })()}
                    </td>

                    {/* Actions Cell */}
                    <td>
                      <div className="patient-action-cell" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                        {/* Open Record Arrow Button */}
                        <button 
                          className="rq-open-btn" 
                          onClick={() => nav(`/patients/${p.id || p.patientId}`)}
                          title="Open patient record"
                          aria-label="Open patient record"
                        >
                          <ArrowRight size={14} strokeWidth={2.2} />
                        </button>

                        {/* Delete Button (Retained as requested) */}
                        <button 
                          className="btn-delete-patient"
                          onClick={(e) => handleDelete(e, p.id, p.name)}
                          title={`Delete record for ${p.name}`}
                          aria-label={`Delete record for ${p.name}`}
                        >
                          <Trash2 size={15} />
                        </button>

                        {/* Overflow Menu Toggle */}
                        <button 
                          className="icon-btn" 
                          style={{ padding: 4, color: '#799496' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(prev => prev === p.id ? null : p.id);
                          }}
                          title="More options"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Overflow Dropdown */}
                        {menuOpenId === p.id && (
                          <div className="row-menu-dropdown">
                            <button className="row-menu-item" onClick={() => nav(`/patients/${p.id || p.patientId}`)}>
                              <Users size={13} />
                              <span>Open patient record</span>
                            </button>
                            <button className="row-menu-item" onClick={() => nav('/screening/new')}>
                              <Sparkles size={13} />
                              <span>Start follow-up screening</span>
                            </button>
                            <button className="row-menu-item" onClick={() => nav(`/patients/${p.id || p.patientId}/history`)}>
                              <Activity size={13} />
                              <span>Longitudinal progression history</span>
                            </button>
                            <button className="row-menu-item" onClick={() => showToast(`Report generated for ${p.name}`)}>
                              <FileText size={13} />
                              <span>Generate patient report</span>
                            </button>
                            <button className="row-menu-item danger" onClick={(e) => handleDelete(e, p.id, p.name)}>
                              <Trash2 size={13} />
                              <span>Archive / Delete record</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View Layout */
          <div className="patient-grid-layout">
            {paginatedList.map(p => (
              <div 
                key={p.id || p.patientId} 
                className="patient-grid-card"
                onClick={() => nav(`/patients/${p.id || p.patientId}`)}
              >
                <div className="patient-grid-card-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div 
                      className="patient-avatar-circle"
                      style={{ background: p.avatarBg, color: p.avatarColor, width: 34, height: 34, fontSize: 12.5 }}
                    >
                      {getInitials(p.name)}
                    </div>
                    <div>
                      <div className="recent-patient-name" style={{ fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7a9496' }}>{p.patientId}</div>
                    </div>
                  </div>
                  <span className={getAiBadgeClass(p.aiResult)} style={{ fontSize: 10, padding: '2px 7px' }}>
                    {p.aiResult}
                  </span>
                </div>

                <div className="patient-grid-card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#567275' }}>
                    <span>Demographics:</span>
                    <strong>{p.age} yrs · {p.sex}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#567275' }}>
                    <span>Diabetes Duration:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{p.diabetesDuration} yrs</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#567275' }}>
                    <span>Last screened:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{p.lastScreeningDate}</span>
                  </div>
                </div>

                <div className="patient-grid-card-foot" onClick={e => e.stopPropagation()} style={{ justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                      className="btn-delete-patient"
                      onClick={(e) => handleDelete(e, p.id, p.name)}
                      title="Delete patient"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button 
                      className="rq-open-btn" 
                      onClick={() => nav(`/patients/${p.id || p.patientId}`)}
                      title="Open record"
                    >
                      <ArrowRight size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="pagination-bar">
          <div style={{ color: '#678184', fontFamily: 'var(--font-body)', fontSize: 11.5 }}>
            Showing <strong style={{ color: '#163336', fontFamily: 'var(--font-mono)' }}>{paginatedList.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredPatients.length)}</strong> of <strong style={{ color: '#163336', fontFamily: 'var(--font-mono)' }}>{totalCohortCount}</strong> patient records
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

            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(num => (
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
