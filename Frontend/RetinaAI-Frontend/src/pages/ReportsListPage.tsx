import React, { useState, useEffect } from 'react';
import { SectionHeader, Card, Button, GradeBadge } from '../components';
import { FileCheck2, Download, ExternalLink } from 'lucide-react';
import { listScreenings } from '../services/screenings';
import { fetchReportPdfBlobUrl } from '../services/reports';
import { screenings as mockScreenings } from '../mock/data';

export default function ReportsListPage() {
  const [list, setList] = useState<any[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    listScreenings().then(res => {
      const items = res?.screenings || res?.items || (Array.isArray(res) ? res : []);
      if (items && items.length > 0) setList(items);
      else setList(mockScreenings);
    }).catch(() => setList(mockScreenings));
  }, []);

  const handleOpenReport = async (targetId: string) => {
    try {
      setOpeningId(targetId);
      const url = await fetchReportPdfBlobUrl(targetId);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Failed to open PDF report:', err);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      <SectionHeader 
        title="Clinical Reports" 
        description="Download and view generated diagnostic reports with side-by-side retinal evidence."
      />
      <Card>
        <div className="report-list">
          {list.map((s, idx) => {
            const sid = s.screening_id || s.screeningId || `SCR-${10291 - idx}`;
            const pid = s.patient_id || s.patientId || 'RTA-2401';
            const pname = s.patient_name || 'Meena Patil';
            const grade = s.left_eye?.dr_grade ?? s.left?.grade ?? 0;
            const targetId = s.id || sid;

            return (
              <div className="report-item" key={sid}>
                <div className="report-item-icon"><FileCheck2 size={18} /></div>
                <div>
                  <strong>{sid} — {pname}</strong>
                  <span>Patient ID: {pid} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : '03 Sep 2026'}</span>
                </div>
                <GradeBadge grade={grade} />
                <Button
                  variant="ghost"
                  onClick={() => handleOpenReport(targetId)}
                  disabled={openingId === targetId}
                >
                  <Download size={14} /> {openingId === targetId ? 'Loading…' : 'PDF Report'}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
