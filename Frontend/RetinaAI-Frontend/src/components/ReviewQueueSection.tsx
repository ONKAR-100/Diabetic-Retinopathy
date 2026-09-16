import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export interface QueueItem {
  patient: string;
  screeningId: string;
  date: string;
  leftGrade: {
    grade: number;
    label: string;
    description: string;
  };
  rightGrade: {
    grade: number;
    label: string;
    description: string;
  };
  confidence: string;
  urgency: 'coral' | 'amber' | 'mint';
}

interface ReviewQueueSectionProps {
  items?: QueueItem[];
  pendingCount?: number;
  loading?: boolean;
  onOpenCase: (screeningId: string, patientName: string) => void;
  onViewAll: () => void;
}

const TODAY_STR = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const DEFAULT_QUEUE_ITEMS: QueueItem[] = [
  {
    patient: 'Maya Das',
    screeningId: 'RTA-00821',
    date: TODAY_STR,
    leftGrade: { grade: 3, label: 'G3', description: 'Severe NPDR' },
    rightGrade: { grade: 2, label: 'G2', description: 'Moderate NPDR' },
    confidence: '96.2%',
    urgency: 'coral'
  },
  {
    patient: 'Arjun Mehta',
    screeningId: 'RTA-00818',
    date: TODAY_STR,
    leftGrade: { grade: 2, label: 'G2', description: 'Moderate NPDR' },
    rightGrade: { grade: 1, label: 'G1', description: 'Mild NPDR' },
    confidence: '91.8%',
    urgency: 'amber'
  },
  {
    patient: 'Farida Begum',
    screeningId: 'RTA-00816',
    date: '10 Sep 2026',
    leftGrade: { grade: 2, label: 'G2', description: 'Moderate NPDR' },
    rightGrade: { grade: 2, label: 'G2', description: 'Moderate NPDR' },
    confidence: '89.4%',
    urgency: 'amber'
  }
];

export function ReviewQueueSection({
  items = [],
  pendingCount = 0,
  loading = false,
  onOpenCase,
  onViewAll
}: ReviewQueueSectionProps) {
  const displayItems = items;


  const getGradeClass = (grade: number) => {
    switch (grade) {
      case 4: return 'grade-badge-g4';
      case 3: return 'grade-badge-g3';
      case 2: return 'grade-badge-g2';
      case 1: return 'grade-badge-g1';
      default: return 'grade-badge-g0';
    }
  };

  return (
    <div className="review-queue-card">
      {/* Header */}
      <div className="rq-header">
        <div className="rq-header-left">
          <span className="rq-eyebrow">NEEDS ATTENTION</span>
          <h2 className="rq-title">Review queue</h2>
        </div>
        <button 
          type="button" 
          className="rq-view-all-btn" 
          onClick={onViewAll}
          title="View full review queue"
        >
          <span>View all</span>
          <ArrowRight size={12} strokeWidth={2.2} />
        </button>
      </div>

      {/* Subtle Horizontal Divider */}
      <div className="rq-header-divider" />

      {/* Content Area: Skeleton / Empty / Rows */}
      {loading ? (
        <div className="rq-skeleton-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rq-skeleton-row">
              <div className="rq-skeleton-bar" style={{ width: 4, height: 30, borderRadius: 99 }} />
              <div style={{ flex: 1, marginLeft: 14 }}>
                <div className="rq-skeleton-line" style={{ width: '40%', height: 13, marginBottom: 6 }} />
                <div className="rq-skeleton-line" style={{ width: '25%', height: 9 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginRight: 20 }}>
                <div className="rq-skeleton-pill" />
                <div className="rq-skeleton-pill" />
              </div>
              <div className="rq-skeleton-line" style={{ width: 45, height: 16, marginRight: 16 }} />
              <div className="rq-skeleton-circle" />
            </div>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="rq-empty-state">
          <div className="rq-empty-icon">
            <CheckCircle2 size={24} color="#67b99f" />
          </div>
          <h3 className="rq-empty-heading">Queue is clear</h3>
          <p className="rq-empty-text">No cases currently require clinical review.</p>
          <button type="button" className="rq-empty-action" onClick={onViewAll}>
            View screening history →
          </button>
        </div>
      ) : (
        <div className="rq-row-list">
          {displayItems.slice(0, 3).map((item, index) => (
            <div
              key={item.screeningId || index}
              className="rq-row-item"
              onClick={() => onOpenCase(item.screeningId, item.patient)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onOpenCase(item.screeningId, item.patient);
                }
              }}
              title={`Open review case for ${item.patient} (${item.screeningId})`}
            >
              {/* Urgency Indicator Bar */}
              <div className={`rq-urgency-indicator urgency-${item.urgency}`} />

              {/* Patient Identity & Metadata */}
              <div className="rq-patient-block">
                <div className="rq-patient-name">{item.patient}</div>
                <div className="rq-metadata-line">
                  <span className="rq-id-mono">{item.screeningId}</span>
                  <span className="rq-meta-sep">·</span>
                  <span className="rq-date-mono">{item.date}</span>
                </div>
              </div>

              {/* Grade Badges Group (OS / OD) */}
              <div className="rq-grade-group">
                {item.leftGrade && (
                  <span 
                    className={`rq-grade-badge ${getGradeClass(item.leftGrade.grade)}`}
                    title={`OS (Left eye): ${item.leftGrade.label} — ${item.leftGrade.description}`}
                  >
                    {item.leftGrade.label}
                  </span>
                )}
                {item.rightGrade && (
                  <span 
                    className={`rq-grade-badge ${getGradeClass(item.rightGrade.grade)}`}
                    title={`OD (Right eye): ${item.rightGrade.label} — ${item.rightGrade.description}`}
                  >
                    {item.rightGrade.label}
                  </span>
                )}
              </div>

              {/* AI Confidence Block */}
              <div className="rq-confidence-block">
                <span className="rq-confidence-label">AI confidence</span>
                <span className="rq-confidence-value">{item.confidence}</span>
              </div>

              {/* Compact Arrow Action Button */}
              <button
                type="button"
                className="rq-open-btn"
                aria-label="Open patient review"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCase(item.screeningId, item.patient);
                }}
              >
                <ArrowRight size={14} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="rq-footer">
        <div className="rq-footer-left">
          <span className="rq-pulse-dot" />
          <span className="rq-footer-cases-text">{pendingCount} cases awaiting review</span>
        </div>
        <div className="rq-footer-right">
          <span className="rq-sla-text">SLA target &lt; 30 sec</span>
        </div>
      </div>
    </div>
  );
}
