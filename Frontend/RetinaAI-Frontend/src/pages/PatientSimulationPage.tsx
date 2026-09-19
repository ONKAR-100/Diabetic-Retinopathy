import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Cpu, Activity, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, Eye, Layers, ShieldAlert, 
  Sparkles, FileText, Info, Compass, HelpCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, 
  YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import { getPatient } from '../services/patients';
import { getPatientSimulations, simulateScreening, extractSimulationsList } from '../services/simulation';
import { SimulationItem } from '../types/simulation';

export default function PatientSimulationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [simulations, setSimulations] = useState<SimulationItem[]>([]);
  const [selectedSimIndex, setSelectedSimIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [recomputing, setRecomputing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load patient data and simulation records
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!id) return;
      try {
        setLoading(true);
        const [patData, simData] = await Promise.all([
          getPatient(id).catch(() => null),
          getPatientSimulations(id).catch(() => [])
        ]);

        if (isMounted) {
          setPatient(patData || {
            name: 'Patient Record',
            patient_display_id: id,
            age: '--',
            sex: '--'
          });
          setSimulations(simData);
          setSelectedSimIndex(0);
          setErrorMessage(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage("Failed to load patient simulation records.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const activeSimulation: SimulationItem | null = useMemo(() => {
    if (simulations.length === 0) return null;
    return simulations[selectedSimIndex] || simulations[0];
  }, [simulations, selectedSimIndex]);

  // Find candidate screening to simulate if none exist
  const candidateScreening = useMemo(() => {
    if (!patient?.screenings || patient.screenings.length === 0) return null;
    return patient.screenings.find((s: any) => 
      s.status === 'complete' || s.left_eye?.biomarkers || s.right_eye?.biomarkers
    ) || patient.screenings[0];
  }, [patient]);

  // Format Recharts data from 101 trajectory samples
  const chartData = useMemo(() => {
    if (!activeSimulation?.trajectory) return [];
    const traj = activeSimulation.trajectory;
    // Harmonize with backend schema (theta, complexity_curve, tortuosity_curve, density_curve)
    const thetaArr = traj.theta || traj.time || [];
    const compArr = traj.complexity_curve || traj.structural_complexity || [];
    const tortArr = traj.tortuosity_curve || traj.tortuosity || [];
    const densArr = traj.density_curve || traj.vascular_bed_density || [];

    return thetaArr.map((t, idx) => {
      const c = compArr[idx] !== undefined ? Number(compArr[idx].toFixed(4)) : 0;
      const tr = tortArr[idx] !== undefined ? Number(tortArr[idx].toFixed(4)) : 0;
      const d = densArr[idx] !== undefined ? Number(densArr[idx].toFixed(4)) : 0;

      // Exact Phase 7 Composite Formula:
      // S_composite = (1 / sqrt(3)) * sqrt(S_complexity^2 + S_tortuosity^2 + S_density^2), clamped to [0, 1]
      const compVal = Math.min(1.0, Math.max(0.0, (1.0 / Math.sqrt(3.0)) * Math.sqrt(c * c + tr * tr + d * d)));

      return {
        theta: Number(t.toFixed(2)),
        structural_complexity: c,
        tortuosity: tr,
        vascular_bed_density: d,
        composite_state: Number(compVal.toFixed(4)),
      };
    });
  }, [activeSimulation]);

  const handleRecompute = async () => {
    const screeningId = activeSimulation?.screening_id || candidateScreening?.screening_id || candidateScreening?.id;
    if (!screeningId) {
      setErrorMessage("No screening available to execute simulation.");
      return;
    }

    try {
      setRecomputing(true);
      setErrorMessage(null);
      const updatedResponse = await simulateScreening(screeningId, true);
      const items = extractSimulationsList(updatedResponse);
      setSimulations(items);
      setSelectedSimIndex(0);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Simulation failed. Please verify biomarker availability.";
      setErrorMessage(typeof msg === 'string' ? msg : "Simulation failed to execute.");
    } finally {
      setRecomputing(false);
    }
  };

  const patientCode = patient?.patient_display_id || patient?.id || id || 'RTA';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1240, margin: '0 auto', paddingBottom: 60 }}>
      {/* Top Header & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <button 
            type="button"
            onClick={() => navigate(`/patients/${id}`)}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6, 
              background: 'none', 
              border: 'none', 
              color: '#0e6264', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 600, 
              fontSize: 13, 
              cursor: 'pointer',
              padding: 0,
              marginBottom: 8
            }}
          >
            <ArrowLeft size={16} /> Back to Patient Profile
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#edf7f6',
              color: '#0e6264',
              display: 'grid',
              placeItems: 'center'
            }}>
              <Cpu size={20} />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: '#132b2e', margin: 0 }}>
              Retinal Computational State Simulation
            </h1>
            <span style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: 12, 
              background: '#e9f2f2', 
              color: '#0e6264', 
              fontWeight: 600, 
              padding: '3px 9px', 
              borderRadius: 6 
            }}>
              {patientCode}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', color: '#688285', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            Linear time-invariant (LTI) continuous state-space relaxation dynamics modeled from Phase 6 vascular biomarkers
          </p>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recomputing || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#0e6264',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              cursor: recomputing || loading ? 'not-allowed' : 'pointer',
              opacity: recomputing || loading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(14, 98, 100, 0.18)'
            }}
          >
            <RefreshCw size={14} className={recomputing ? "animate-spin" : ""} />
            <span>{recomputing ? 'Simulating Engine...' : 'Recompute Simulation'}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div style={{
          padding: '12px 16px',
          background: '#fef2f2',
          border: '1px solid #fee2e2',
          borderRadius: 12,
          color: '#991b1b',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mandatory Engineering / Research Disclaimer Alert */}
      <div style={{
        background: '#f4f8f8',
        border: '1px solid #cbe0df',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14
      }}>
        <ShieldAlert size={22} color="#0e6264" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#132b2e' }}>
            Research &amp; Engineering Computational Simulation Notice
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#506e71', lineHeight: 1.5 }}>
            This dynamic simulation executes a 3-dimensional linear time-invariant state-space model over 
            dimensionless relaxation time <strong>θ = 0 → 10</strong>. The variable <strong>θ</strong> denotes computational 
            relaxation time within the state-space solver, <strong>not</strong> months, years, disease progression duration, or biological aging.
            These results are <strong>engineering and biomedical research outputs</strong> and are <strong>not</strong> clinically validated diagnostic, 
            risk, prognosis, or disease-progression measures.
          </p>
        </div>
      </div>

      {/* Eye Selector / Simulation Tabs if multiple exist */}
      {simulations.length > 1 && (
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #edf2f1', paddingBottom: 10 }}>
          {simulations.map((sim, idx) => (
            <button
              key={sim.id || idx}
              type="button"
              onClick={() => setSelectedSimIndex(idx)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 700,
                border: selectedSimIndex === idx ? '1px solid #0e6264' : '1px solid #dce8e7',
                background: selectedSimIndex === idx ? '#0e6264' : '#ffffff',
                color: selectedSimIndex === idx ? '#ffffff' : '#456164',
                cursor: 'pointer'
              }}
            >
              <Eye size={14} />
              <span>{sim.eye ? `${sim.eye.toUpperCase()} Eye` : `Simulation #${idx + 1}`}</span>
              <span style={{
                fontSize: 10.5,
                opacity: 0.85,
                fontFamily: 'var(--font-mono)'
              }}>
                ({new Date(sim.created_at).toLocaleDateString()})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Simulation View */}
      {loading ? (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #edf2f1',
          padding: 60,
          textAlign: 'center',
          color: '#657e81'
        }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#0e6264' }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Loading computational simulation data...</p>
        </div>
      ) : activeSimulation && activeSimulation.execution_status === 'completed' && activeSimulation.output_state ? (
        <>
          {/* Metadata Ribbon */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #edf2f1',
            borderRadius: 14,
            padding: '14px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)'
          }}>
            <div>
              <span style={{ fontSize: 11, color: '#7a9295', display: 'block' }}>Simulation Status</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: '#1a7751',
                marginTop: 2
              }}>
                <CheckCircle2 size={13} /> Completed
              </span>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#7a9295', display: 'block' }}>Execution Date &amp; Time</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#132b2e' }}>
                {activeSimulation.created_at ? new Date(activeSimulation.created_at).toLocaleString() : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#7a9295', display: 'block' }}>Examined Eye</span>
              <strong style={{ fontSize: 12.5, color: '#132b2e', textTransform: 'capitalize' }}>
                {activeSimulation.eye ? `${activeSimulation.eye} Eye` : 'Bilateral'}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#7a9295', display: 'block' }}>Simulink Model / Solver</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#0e6264' }}>
                {activeSimulation.model_name} (ode4, Δt=0.1)
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#7a9295', display: 'block' }}>Model / Sim Version</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#132b2e' }}>
                v{activeSimulation.model_version} / v{activeSimulation.simulation_version}
              </strong>
            </div>
          </div>

          {/* 4 Terminal Computational States (Cards Grid) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16
          }}>
            {/* S_comp */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #edf2f1',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#688285', fontWeight: 600 }}>Structural Complexity State</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#0e6264', background: '#edf7f6', padding: '2px 6px', borderRadius: 4 }}>x₁(10)</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#0e6264', margin: '6px 0 2px' }}>
                {activeSimulation.output_state.structural_complexity_state.toFixed(4)}
              </div>
              <span style={{ fontSize: 11, color: '#889ea0' }}>Inputs: Branch Count (50%) + D_f* (50%)</span>
            </div>

            {/* S_tort */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #edf2f1',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#688285', fontWeight: 600 }}>Tortuosity Computational State</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>x₂(10)</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#d97706', margin: '6px 0 2px' }}>
                {activeSimulation.output_state.tortuosity_computational_state.toFixed(4)}
              </div>
              <span style={{ fontSize: 11, color: '#889ea0' }}>Inputs: Distance τ_d (60%) + Curvature τ_c (40%)</span>
            </div>

            {/* S_dens */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #edf2f1',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 2px 10px rgba(14, 98, 100, 0.02)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#688285', fontWeight: 600 }}>Vascular Bed Density State</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>x₃(10)</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#2563eb', margin: '6px 0 2px' }}>
                {activeSimulation.output_state.vascular_bed_density_state.toFixed(4)}
              </div>
              <span style={{ fontSize: 11, color: '#889ea0' }}>Inputs: Vessel Density (60%) + Zone B (40%)</span>
            </div>

            {/* S_composite */}
            <div style={{
              background: '#fbfbfe',
              border: '1px solid #e0e7ff',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#4338ca', fontWeight: 700 }}>Composite Retinal State</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4f46e5', background: '#eef2ff', padding: '2px 6px', borderRadius: 4 }}>S_comp*</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#4338ca', margin: '6px 0 2px' }}>
                {activeSimulation.output_state.composite_retinal_computational_state.toFixed(4)}
              </div>
              <span style={{ fontSize: 11, color: '#6366f1' }}>1/√3 · √(x₁² + x₂² + x₃²) in [0, 1]</span>
            </div>
          </div>

          {/* Trajectory Visualization Section (Recharts) */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #edf2f1',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                  Dynamic State-Space Relaxation Trajectory
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#779193' }}>
                  Simulink ODE4 numerical integration from initial state x(0) = [0, 0, 0]ᵀ toward asymptotic equilibrium
                </p>
              </div>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: '#f8faf9',
                border: '1px solid #dce8e7',
                borderRadius: 8,
                fontSize: 11.5,
                color: '#557275',
                fontFamily: 'var(--font-mono)'
              }}>
                <Clock size={13} />
                <span>θ = 0 → 10 (101 samples, step=0.1)</span>
              </div>
            </div>

            {/* Recharts Chart */}
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f2" vertical={false} />
                  <XAxis 
                    dataKey="theta" 
                    type="number"
                    domain={[0, 10]}
                    ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                    tick={{ fontSize: 11, fill: '#6c8588', fontFamily: 'var(--font-mono)' }}
                    label={{ 
                      value: 'Computational simulation time (θ)', 
                      position: 'insideBottom', 
                      offset: -16, 
                      fill: '#435e61', 
                      fontSize: 12, 
                      fontWeight: 600,
                      fontFamily: 'var(--font-body)'
                    }}
                  />
                  <YAxis 
                    domain={[0, 1]}
                    ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                    tick={{ fontSize: 11, fill: '#6c8588', fontFamily: 'var(--font-mono)' }}
                    label={{ 
                      value: 'Computational State Magnitude', 
                      angle: -90, 
                      position: 'insideLeft', 
                      offset: 5,
                      fill: '#435e61', 
                      fontSize: 12, 
                      fontWeight: 600,
                      fontFamily: 'var(--font-body)'
                    }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgba(255, 255, 255, 0.95)', 
                      border: '1px solid #dce8e7', 
                      borderRadius: 10,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)'
                    }}
                    formatter={(val: any, name: any) => [
                      typeof val === 'number' ? val.toFixed(4) : val,
                      name === 'structural_complexity' ? 'Structural Complexity (x₁)' :
                      name === 'tortuosity' ? 'Tortuosity State (x₂)' :
                      name === 'vascular_bed_density' ? 'Vascular Bed Density (x₃)' :
                      name === 'composite_state' ? 'Composite Retinal State (S)' : name
                    ]}
                    labelFormatter={(label) => `Computational Time θ = ${label}`}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        structural_complexity: 'Structural Complexity State (x₁)',
                        tortuosity: 'Tortuosity State (x₂)',
                        vascular_bed_density: 'Vascular Bed Density (x₃)',
                        composite_state: 'Composite Retinal State (S_composite)'
                      };
                      return <span style={{ fontSize: 11.5, color: '#334e51', fontWeight: 600 }}>{labels[value] || value}</span>;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="structural_complexity" 
                    stroke="#0e6264" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="tortuosity" 
                    stroke="#d97706" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="vascular_bed_density" 
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="composite_state" 
                    stroke="#7c3aed" 
                    strokeWidth={2.5} 
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dual Tables: Source Biomarkers vs Normalized Inputs Contract v1.0.0 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 20
          }}>
            {/* Table 1: Source Phase 6 Biomarkers */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #edf2f1',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <FileText size={17} color="#0e6264" />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                  Source Biomarker Inputs (Phase 6)
                </h3>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: '#779193' }}>
                Extracted directly by frozen MATLAB subsystem (retina_biomarkers.m)
              </p>

              {activeSimulation.input_snapshot ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Vessel Density (Vd)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.vessel_density !== undefined ? Number(activeSimulation.input_snapshot.vessel_density).toFixed(4) : '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Skeleton Branch Count</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.branch_count ?? '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Zone B Branch Count</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.zone_b_count ?? '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Distance Tortuosity (τ_d)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.distance_tortuosity !== undefined ? Number(activeSimulation.input_snapshot.distance_tortuosity).toFixed(4) : '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Curvature Tortuosity (τ_c)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.curvature_tortuosity !== undefined ? Number(activeSimulation.input_snapshot.curvature_tortuosity).toFixed(4) : '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Fractal Dimension (Df)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.fractal_dimension !== undefined ? Number(activeSimulation.input_snapshot.fractal_dimension).toFixed(4) : '--'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>Fractal Fit Linearity (R²)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#132b2e' }}>
                      {activeSimulation.input_snapshot.fractal_r_squared !== undefined ? Number(activeSimulation.input_snapshot.fractal_r_squared).toFixed(4) : '--'}
                    </strong>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: '#7a9295', fontSize: 12 }}>
                  Source input snapshot not available for this run.
                </div>
              )}
            </div>

            {/* Table 2: Normalized Inputs Contract v1.0.0 */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #edf2f1',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={17} color="#0e6264" />
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                    Normalized Input Vector
                  </h3>
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  background: '#edf7f6',
                  color: '#0e6264',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6
                }}>
                  Contract: v{activeSimulation.normalized_inputs?.normalization_version || '1.0.0'}
                </span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: '#779193' }}>
                Deterministic bounded mapping clamped to [0, 1] feeding the 6-input Simulink port
              </p>

              {activeSimulation.normalized_inputs ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_dens = clamp(Vd / 0.20, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_dens.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_branch = clamp(N_branch / 500, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_branch.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_zb = clamp(N_zb / 30, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_zb.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_tau_d = clamp(τ_d / 0.04, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_tau_d.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_tau_c = clamp(τ_c / 0.30, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_tau_c.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>u_Df* (Reliability Weighted Df)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#0e6264' }}>
                      {activeSimulation.normalized_inputs.u_Df_star.toFixed(6)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f4f8f7', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ color: '#557275' }}>w_fit = clamp((R² - 0.90) / 0.10, 0, 1)</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#507578' }}>
                      {activeSimulation.normalized_inputs.w_fit.toFixed(4)}
                    </strong>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: '#7a9295', fontSize: 12 }}>
                  Normalized vector not available for this run.
                </div>
              )}
            </div>
          </div>

          {/* State-Space Mathematical Formulation Reference */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #edf2f1',
            borderRadius: 16,
            padding: 22,
            boxShadow: '0 4px 20px rgba(14, 98, 100, 0.035)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Compass size={17} color="#0e6264" />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#132b2e', margin: 0 }}>
                State-Space Mathematical Foundation
              </h3>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#779193', lineHeight: 1.5 }}>
              Continuous-time linear time-invariant (LTI) system with convex row-sum normalized coupling:
            </p>
            <div style={{
              background: '#f8faf9',
              border: '1px solid #e5eded',
              borderRadius: 10,
              padding: '12px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: '#132b2e',
              lineHeight: 1.6
            }}>
              <div>ẋ(θ) = A · x(θ) + B · u, &nbsp; x(0) = [0, 0, 0]ᵀ, &nbsp; y(θ) = C · x(θ) + D · u</div>
              <div style={{ color: '#5b7679', marginTop: 4 }}>
                A = -I₃ (asymptotically stable poles at -1) &nbsp;|&nbsp; C = I₃ &nbsp;|&nbsp; D = 0₃ₓ₆
              </div>
              <div style={{ color: '#5b7679', marginTop: 2 }}>
                Row 1: ẋ₁ = -x₁ + 0.50·u_branch + 0.50·u_Df*
              </div>
              <div style={{ color: '#5b7679', marginTop: 2 }}>
                Row 2: ẋ₂ = -x₂ + 0.60·u_tau_d + 0.40·u_tau_c
              </div>
              <div style={{ color: '#5b7679', marginTop: 2 }}>
                Row 3: ẋ₃ = -x₃ + 0.60·u_dens + 0.40·u_zb
              </div>
              <div style={{ color: '#4338ca', marginTop: 4, fontWeight: 700 }}>
                S_composite = (1 / √3) · √(x₁² + x₂² + x₃²) &nbsp;∈&nbsp; [0, 1]
              </div>
            </div>
          </div>
        </>
      ) : activeSimulation && activeSimulation.execution_status === 'failed' ? (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #fee2e2',
          padding: 40,
          textAlign: 'center'
        }}>
          <AlertCircle size={36} color="#b73d44" style={{ margin: '0 auto 14px' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#991b1b', margin: '0 0 8px' }}>
            Simulation Execution Failed
          </h2>
          <p style={{ maxWidth: 500, margin: '0 auto 20px', fontSize: 13, color: '#688285', lineHeight: 1.5 }}>
            {activeSimulation.error_message || "The state-space simulation engine could not process the provided biomarker vector. Please verify that segmentation and biomarker extraction have completed."}
          </p>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recomputing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#0e6264',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={recomputing ? "animate-spin" : ""} />
            <span>Retry Simulation</span>
          </button>
        </div>
      ) : (
        /* Empty / Not Simulated State */
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px dashed #c9d8d7',
          padding: 48,
          textAlign: 'center'
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: '#edf7f6',
            color: '#0e6264',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px'
          }}>
            <Cpu size={26} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#132b2e', margin: '0 0 8px' }}>
            No Computational Simulation Recorded
          </h2>
          <p style={{ maxWidth: 520, margin: '0 auto 24px', fontSize: 13, color: '#657e81', lineHeight: 1.55 }}>
            State-space simulation allows modeling retinal vascular relaxation dynamics from Phase 6 biomarkers. 
            Click below to execute the Simulink LTI computational model.
          </p>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recomputing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#0e6264',
              color: '#ffffff',
              border: 'none',
              borderRadius: 11,
              padding: '11px 22px',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: recomputing ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(14, 98, 100, 0.2)'
            }}
          >
            <RefreshCw size={15} className={recomputing ? "animate-spin" : ""} />
            <span>{recomputing ? 'Executing Simulation...' : 'Execute Computational Simulation'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
