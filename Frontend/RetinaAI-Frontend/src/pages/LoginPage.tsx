import React, { useState } from 'react';
import { Activity, CheckCircle2, ArrowRight, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card } from '../components';

export default function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      nav('/');
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-left">
        <div className="brand">
          <div className="brand-mark"><Activity size={20} strokeWidth={2.4} color="#0d4f53" /></div>
          <div><div className="brand-name">RetinaAI</div><div className="brand-sub">DR Screening</div></div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">AI-ASSISTED SCREENING</span>
          <h1>Bring clearer retinal screening to primary healthcare.</h1>
          <p>A focused clinical workstation for image quality coaching, AI-assisted assessment, explainability, human review, and referral support.</p>
          <div className="login-points">
            <div><CheckCircle2 size={17} /><span>Offline-ready workflow</span></div>
            <div><CheckCircle2 size={17} /><span>Human-in-the-loop review</span></div>
            <div><CheckCircle2 size={17} /><span>Model evidence made visible</span></div>
          </div>
        </div>
        <div className="login-foot">SIH 26038 A Explainable AI for Diabetic Retinopathy Screening in Rural India</div>
      </div>
      <div className="login-right">
        <Card className="login-card">
          <div className="login-head">
            <span className="eyebrow">SECURE SIGN IN</span>
            <h2>Welcome back</h2>
            <p>Use your credentials to access the screening workstation.</p>
          </div>
          <form onSubmit={handleSubmit}>
            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
            <label className="field">ID
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. hw_user" />
            </label>
            <label className="field">Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            <Button type="submit" className="full" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={16} /></Button>
          </form>
          <div className="login-note"><LockKeyhole size={15} /> Designed for AI-assisted diabetic retinopathy screening.</div>
        </Card>
      </div>
    </div>
  );
}
