import React, { useEffect, useState } from 'react';
import { ReviewQueueTable } from '../components/ReviewQueueTable';
import { getReviewQueue } from '../services/review';
import { ScreeningResult } from '../types';

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<ScreeningResult[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    getReviewQueue()
      .then(res => setQueue(res || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Editorial Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="greeting-eyebrow">CLINICAL VERIFICATION WORKSPACE</div>
          <h1 className="greeting-title" style={{ fontSize: 28, marginTop: 4 }}>Review Queue</h1>
          <p className="greeting-sub">Prioritized list of ophthalmic screenings requiring specialist doctor verification.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="status-pill" style={{ background: '#ffffff', borderColor: '#e2eceb' }}>
            <span className="rq-pulse-dot" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>Active Queue · SLA &lt; 30s</span>
          </div>
        </div>
      </div>

      <div className="panel-clinical" style={{ padding: 24, borderRadius: 16 }}>
        <ReviewQueueTable screenings={queue} />
      </div>
    </div>
  );
}
