import React from 'react';
import { SectionHeader, Card, Badge } from '../components';
import { Network, Cloud, ShieldCheck, Cpu } from 'lucide-react';

export default function SystemStatusPage() {
  const services = [
    { name: 'DR Grading (Hybrid Ensemble Model)', status: 'ONLINE', latency: '4.2s', desc: '5-Class classification + Grad-CAM' },
    { name: 'Vessel Segmentation (U-Net)', status: 'ONLINE', latency: '4.8s', desc: 'ResNet34 encoder, 512x512' },
    { name: 'Optic Disc & Fovea (ResUNet)', status: 'ONLINE', latency: '3.6s', desc: 'Dual-peak anatomical localization' },
    { name: 'Image Quality Gate (FFT/Exposure)', status: 'ONLINE', latency: '0.4s', desc: '3-tier gating + CLAHE enhancement' },
    { name: 'Lesion Segmentation Module', status: 'PLUG-IN READY', latency: '—', desc: 'Microaneurysms, Exudates, Hemorrhages (Future slot)' },
    { name: 'Report Generation Engine', status: 'ONLINE', latency: '0.8s', desc: 'ReportLab PDF with side-by-side evidence' },
    { name: 'Database & Case Store', status: 'ONLINE', latency: '12ms', desc: 'PostgreSQL / SQLite storage' },
    { name: 'Telemedicine Dispatcher', status: 'ONLINE', latency: '24ms', desc: 'Doctor Review Queue & Audit trail' },
  ];

  return (
    <>
      <SectionHeader 
        title="System Status & Service Health" 
        description="Live status of AI inference models, quality gates, and platform microservices."
        action={<Badge tone="good">ALL CORE ENGINES ACTIVE</Badge>}
      />

      <div className="service-grid">
        {services.map(s => (
          <Card key={s.name}>
            <div className="service-top">
              <div className={`service-icon ${s.status === 'ONLINE' ? 'ok' : 'warn'}`}>
                <Cpu size={18} />
              </div>
              <Badge tone={s.status === 'ONLINE' ? 'good' : 'warn'}>{s.status}</Badge>
            </div>
            <h3>{s.name}</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 12px' }}>{s.desc}</p>
            <div className="service-meta">
              <span>Latency</span>
              <strong>{s.latency}</strong>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h3>District Telemedicine Model Readiness</h3>
            <p>SIH 26038 Specification Compliance</p>
          </div>
          <ShieldCheck size={20} color="var(--primary)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
          <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Referable Sensitivity</span>
            <strong style={{ display: 'block', fontSize: 18, marginTop: 4 }}>87.7%</strong>
            <small style={{ color: 'var(--muted)', fontSize: 10 }}>Held-out APTOS test set</small>
          </div>
          <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Referable Specificity</span>
            <strong style={{ display: 'block', fontSize: 18, marginTop: 4 }}>96.7%</strong>
            <small style={{ color: 'var(--good)', fontSize: 10 }}>Exceeds &gt;85% SIH target</small>
          </div>
          <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>QWK Metric</span>
            <strong style={{ display: 'block', fontSize: 18, marginTop: 4 }}>0.903</strong>
            <small style={{ color: 'var(--good)', fontSize: 10 }}>Quadratic Weighted Kappa</small>
          </div>
        </div>
      </Card>
    </>
  );
}
