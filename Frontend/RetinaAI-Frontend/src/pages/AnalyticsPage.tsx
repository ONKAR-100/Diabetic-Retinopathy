import React, { useState, useEffect } from 'react';
import { SectionHeader, Card, MetricCard } from '../components';
import { Table2, Stethoscope, RefreshCcw, TimerReset } from 'lucide-react';
import { getAnalyticsSummary } from '../services/analytics';
import { AnalyticsSummary } from '../types';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    getAnalyticsSummary().then(setData).catch(() => {});
  }, []);

  const total = data?.total_screenings || 128;
  const referable = data?.referable_cases || 23;
  const recaptureRate = data ? ((data.recapture_rate || 0) * 100).toFixed(1) : '9.4';
  const pending = data?.pending_reviews || 7;
  const grades = data?.grade_distribution || { '0': 42, '1': 29, '2': 31, '3': 17, '4': 9 };
  const maxGrade = Math.max(...Object.values(grades).map(Number), 1);

  const gradeLabels: Record<string, string> = {
    '0': 'Grade 0 · No DR',
    '1': 'Grade 1 · Mild NPDR',
    '2': 'Grade 2 · Moderate NPDR',
    '3': 'Grade 3 · Severe NPDR',
    '4': 'Grade 4 · Proliferative DR'
  };

  return (
    <>
      <SectionHeader 
        title="Analytics & Clinical Insights" 
        description="Operational screening trends, DR grade breakdown, and telemedicine metrics."
      />
      <div className="metric-grid">
        <MetricCard label="Total Screenings" value={total} delta="+12.3% vs last month" icon={Table2} />
        <MetricCard label="Referable Cases" value={referable} delta={`${((referable/total)*100).toFixed(1)}% of total`} icon={Stethoscope} />
        <MetricCard label="Recapture Rate" value={`${recaptureRate}%`} delta="-2.1% improvement" icon={RefreshCcw} />
        <MetricCard label="Pending Reviews" value={pending} delta="Ophthalmologist queue" icon={TimerReset} />
      </div>

      <div className="analytics-grid">
        <Card>
          <div className="card-head">
            <div>
              <h3>DR Severity Grade Distribution</h3>
              <p>5-level grading across screened population</p>
            </div>
          </div>
          <div className="analytics-bars">
            {Object.entries(grades).map(([g, val]) => (
              <div key={g}>
                <div className="bar-head">
                  <span>{gradeLabels[g] || `Grade ${g}`}</span>
                  <strong>{val}</strong>
                </div>
                <div className="bar large">
                  <span style={{ width: `${(Number(val) / maxGrade) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <div>
              <h3>Monthly Screening Volume</h3>
              <p>Scaling towards district telemedicine capacity</p>
            </div>
          </div>
          <div className="spark-bars">
            {[58, 72, 80, 88, 104, 128].map((v, i) => (
              <div key={i} style={{ height: `${(v / 128) * 100}%` }}>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div className="month-labels">
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
          </div>
        </Card>
      </div>

      <div className="analytics-grid">
        <Card>
          <h3>Image Quality Distribution</h3>
          <div className="quality-ring">
            <div className="ring-center">
              <strong>87%</strong>
              <span>acceptable</span>
            </div>
          </div>
          <div className="ring-legend">
            <span><i className="good-dot" />Acceptable 87%</span>
            <span><i className="warn-dot" />Recapture 9%</span>
            <span><i className="neutral-dot" />Borderline 4%</span>
          </div>
        </Card>

        <Card>
          <h3>Telemedicine Validations</h3>
          <div className="big-stat">{data?.average_review_time ? data.average_review_time.toFixed(1) : '14.2'}<span>sec</span></div>
          <p>Average human review duration (Target &lt; 30s).</p>
          <div className="mini-stat-grid" style={{ marginTop: '16px' }}>
            <div><strong>9.4s</strong><span>AI Pipeline</span></div>
            <div><strong>0.5s</strong><span>Quality Gate</span></div>
          </div>
        </Card>
      </div>
    </>
  );
}
