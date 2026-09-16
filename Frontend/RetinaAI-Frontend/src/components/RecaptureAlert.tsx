import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../components';

export function RecaptureAlert({ reason, message }: { reason: string, message: string }) {
  const titles: Record<string, string> = {
    too_dark: "Image Too Dark",
    overexposed_glare: "Overexposed / Flash Glare",
    blurry_recapture_recommended: "Out of Focus",
    poor_framing_or_no_retina_detected: "Poor Framing",
    unreadable_file: "Invalid Image"
  };

  const msgs: Record<string, string> = {
    too_dark: "Increase illumination and ensure the camera flash is working.",
    overexposed_glare: "Reduce brightness or adjust angle to avoid glare.",
    blurry_recapture_recommended: "Clean the lens and stabilize the device.",
    poor_framing_or_no_retina_detected: "Center the optic disc and ensure the retina is visible.",
    unreadable_file: "Please upload a valid JPEG or PNG fundus image."
  };

  return (
    <Card className="danger" style={{ borderLeft: '4px solid var(--danger)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <AlertTriangle color="var(--danger)" />
        <h3 style={{ margin: 0 }}>Image Ungradable — Recapture Required</h3>
      </div>
      <div style={{ marginLeft: 36 }}>
        <strong>{titles[reason] || reason}</strong>
        <p style={{ marginTop: 4 }}>{message || msgs[reason] || "Please retake the image."}</p>
      </div>
    </Card>
  );
}
