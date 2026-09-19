import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Cpu, ArrowRight, Activity, CheckCircle2, 
  AlertCircle, RefreshCw, Layers, ShieldCheck, Sparkles 
} from 'lucide-react';
import { getPatientSimulations, simulateScreening } from '../services/simulation';
import { RetinalSimulationRecord } from '../types/simulation';

interface RetinalSimulationCardProps {
  patientId: string;
  screenings?: any[];
}

export default function RetinalSimulationCard({ patientId, screenings = [] }: RetinalSimulationCardProps) {
  const navigate = useNavigate();
  const [simulations, setSimulations] = useState<RetinalSimulationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Find latest screening with biomarker results or complete status
  const targetScreening = React.useMemo(() => {
    if (!screenings || screenings.length === 0) return null;
    // Prefer screening that has biomarkers or complete status
    return screenings.find((s: any) => 
      s.status === 'complete' || s.left_eye?.biomarkers || s.right_eye?.biomarkers
    ) || screenings[0];
  }, [screenings]);

  useEffect(() => {
    let isMounted = true;
    async function loadSimulations() {
      if (!patientId) return;
      try {
        setLoading(true);
        const records = await getPatientSimulations(patientId);
        if (isMounted) {
          setSimulations(records);
          setErrorMessage(null);
        }
      } catch (err: any) {
        if (isMounted) {
          // Graceful fallback - do not crash patient page
          setErrorMessage("Simulation records temporarily unavailable");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSimulations();
    return () => { isMounted = false; };
  }, [patientId]);

  const latestSimulation = simulations.length > 0 ? simulations[0] : null;

  const handleRunSimulation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!targetScreening) return;
    const screeningId = targetScreening.screening_id || targetScreening.id;
    if (!screeningId) return;

    try {
      setExecuting(true);
      setErrorMessage(null);
      const res = await simulateScreening(screeningId, true);
      setSimulations(prev => [res, ...prev.filter(s => s.id !== res.id)]);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Simulation execution encountered an issue. Please verify biomarker availability.";
      setErrorMessage(typeof msg === 'string' ? msg : "Simulation failed to complete.");
    } finally {
      setExecuting(false);
    }
  };

  const handleViewSimulation = () => {
    navigate(`/patients/${patientId}/simulation`);
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #edf2f1',
      borderRadius: 16,
      padding: 22,
      boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }}>
      {/* Card Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: '#edf7f6',
            color: '#0e6264',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0
          }}>
            <Cpu size={19} />
          </div>
          <div>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16.5,
              fontWeight: 700,
              color: '#132b2e',
              margin: 0
            }}>
              Retinal Computational State
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#779193' }}>
              Dynamic state-space simulation (Simulink ode4)
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {loading ? (
            <span style={{ fontSize: 11, color: '#889da0', fontFamily: 'var(--font-mono)' }}>Loading...</span>
          ) : latestSimulation?.execution_status === 'completed' ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              color: '#1a7751',
              background: '#ecf8f3',
              padding: '3px 9px',
              borderRadius: 12
            }}>
              <CheckCircle2 size={12} /> Simulated
            </span>
          ) : latestSimulation?.execution_status === 'failed' ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              color: '#b73d44',
              background: '#fceced',
              padding: '3px 9px',
              borderRadius: 12
            }}>
              <AlertCircle size={12} /> Execution Failed
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              color: '#526c6f',
              background: '#f0f4f4',
              padding: '3px 9px',
              borderRadius: 12
            }}>
              Ready for Simulation
            </span>
          )}
        </div>
      </div>

      {/* Error Notice (if any) */}
      {errorMessage && (
        <div style={{
          padding: '9px 12px',
          background: '#fef2f2',
          border: '1px solid #fee2e2',
          borderRadius: 10,
          fontSize: 12,
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Content depending on state */}
      {latestSimulation && latestSimulation.execution_status === 'completed' && latestSimulation.output_state ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Eye & Version indicator */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11.5,
            color: '#657e81',
            padding: '7px 12px',
            background: '#f8faf9',
            borderRadius: 8
          }}>
            <span>Eye: <strong style={{ color: '#132b2e', textTransform: 'capitalize' }}>{latestSimulation.eye} Eye</strong></span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>Model v{latestSimulation.model_version}</span>
          </div>

          {/* 4 State Equilibrium Outputs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8
          }}>
            <div style={{ background: '#f4f8f7', padding: '10px 12px', borderRadius: 10 }}>
              <span style={{ fontSize: 10.5, color: '#688285', display: 'block' }}>Structural Complexity</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: '#0e6264' }}>
                {latestSimulation.output_state.structural_complexity_state.toFixed(4)}
              </strong>
            </div>

            <div style={{ background: '#f4f8f7', padding: '10px 12px', borderRadius: 10 }}>
              <span style={{ fontSize: 10.5, color: '#688285', display: 'block' }}>Tortuosity State</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: '#d97706' }}>
                {latestSimulation.output_state.tortuosity_computational_state.toFixed(4)}
              </strong>
            </div>

            <div style={{ background: '#f4f8f7', padding: '10px 12px', borderRadius: 10 }}>
              <span style={{ fontSize: 10.5, color: '#688285', display: 'block' }}>Vascular Bed Density</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: '#2563eb' }}>
                {latestSimulation.output_state.vascular_bed_density_state.toFixed(4)}
              </strong>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', padding: '10px 12px', borderRadius: 10 }}>
              <span style={{ fontSize: 10.5, color: '#3b82f6', display: 'block', fontWeight: 600 }}>Composite State</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: '#1d4ed8' }}>
                {latestSimulation.output_state.composite_retinal_computational_state.toFixed(4)}
              </strong>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: '#7e9698', fontStyle: 'italic' }}>
            Dimensionless relaxation window: θ = 0 → 10 (101 trajectory samples)
          </div>
        </div>
      ) : (
        <div style={{
          background: '#fbfcfc',
          border: '1px dashed #d8e4e3',
          borderRadius: 12,
          padding: '16px 14px',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, color: '#4b6467', fontWeight: 600 }}>
            Biomarker Computational Modeling
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: '#7a9295', lineHeight: 1.45 }}>
            Simulate dynamic continuous state-space trajectories (S_comp, S_tort, S_dens) from Phase 6 retinal vascular biomarkers.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          type="button"
          onClick={handleViewSimulation}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: '#0e6264',
            color: '#ffffff',
            border: 'none',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s'
          }}
        >
          <span>View Simulation</span>
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          onClick={handleRunSimulation}
          disabled={executing || !targetScreening}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: '#f4fbf9',
            border: '1px solid #c3dedd',
            color: '#0e6264',
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: executing || !targetScreening ? 'not-allowed' : 'pointer',
            opacity: executing || !targetScreening ? 0.6 : 1
          }}
          title={targetScreening ? "Run or recompute computational simulation" : "No screening available"}
        >
          <RefreshCw size={13} className={executing ? "animate-spin" : ""} />
          <span>{executing ? 'Simulating...' : latestSimulation ? 'Re-run' : 'Simulate'}</span>
        </button>
      </div>

      {/* Engineering Disclaimer Footnote */}
      <div style={{
        fontSize: 10,
        color: '#8ba2a4',
        borderTop: '1px solid #f0f4f4',
        paddingTop: 8,
        lineHeight: 1.4
      }}>
        Research &amp; engineering computational state output. Not for diagnostic or prognostic prediction.
      </div>
    </div>
  );
}
