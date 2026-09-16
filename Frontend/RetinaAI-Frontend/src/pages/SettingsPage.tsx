import React, { useState } from 'react';
import { SectionHeader, Card, Button } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { LockKeyhole, Globe, Volume2, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [lang, setLang] = useState('English');
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [networkMode, setNetworkMode] = useState('Standard');

  return (
    <>
      <SectionHeader 
        title="Settings & Preferences" 
        description="Configuration for screening centre operations, language, and clinical protocols."
      />

      <div className="settings-grid">
        <Card>
          <h3>Operator Profile</h3>
          <div className="settings-row">
            <div className="avatar">
              {user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'HW'}
            </div>
            <div>
              <strong>{user?.full_name || 'Health Worker'}</strong>
              <span>{user?.centre || 'District Primary Health Centre'} · Role: {user?.role || 'health_worker'}</span>
            </div>
          </div>
          <hr />
          <Button variant="danger" onClick={logout} style={{ width: '100%' }}>
            Sign Out
          </Button>
        </Card>

        <Card>
          <h3>Localization & Voice Coach</h3>
          <label className="field" style={{ marginBottom: 14 }}>
            Interface Language
            <select value={lang} onChange={e => setLang(e.target.value)}>
              <option value="English">English</option>
              <option value="Hindi">हिंदी (Hindi)</option>
              <option value="Marathi">मराठी (Marathi)</option>
              <option value="Tamil">தமிழ் (Tamil)</option>
            </select>
          </label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <div>
              <strong>Spoken Retinal Positioning</strong>
              <small style={{ display: 'block', color: 'var(--muted)' }}>Voice prompts for patient alignment</small>
            </div>
            <button 
              type="button"
              className={`toggle ${voiceGuidance ? 'on' : ''}`} 
              onClick={() => setVoiceGuidance(!voiceGuidance)}
            >
              <span />
            </button>
          </div>
        </Card>

        <Card>
          <h3>Network & Telemedicine Sync</h3>
          <label className="field" style={{ marginBottom: 14 }}>
            Image Upload Optimization
            <select value={networkMode} onChange={e => setNetworkMode(e.target.value)}>
              <option value="Standard">Standard Resolution (Full Clinical Quality)</option>
              <option value="LowBandwidth">Low Bandwidth (Aggressive Compression for 2G/3G)</option>
              <option value="OfflineFirst">Offline-First (Batch sync when online)</option>
            </select>
          </label>
          <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 10, fontSize: 11, color: 'var(--muted)' }}>
            <LockKeyhole size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Encrypted patient transfer enabled. Complies with clinical telemedicine standards.
          </div>
        </Card>
      </div>
    </>
  );
}
