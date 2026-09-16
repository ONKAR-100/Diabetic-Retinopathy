import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Camera, Upload, CheckCircle2, AlertTriangle, XCircle, 
  Zap, RotateCcw, ChevronDown, ChevronUp, ArrowRight, 
  Eye, Sparkles, ShieldCheck, Check, Info 
} from 'lucide-react';
import { SectionHeader, Stepper, Card, Button, Badge, Progress } from '../components';
import { useScreening, EyeQualityData } from '../contexts/ScreeningContext';
import { uploadImage, assessQuality } from '../services/screenings';

type ProcessingState = 'idle' | 'uploading' | 'assessing' | 'enhancing' | 'done' | 'error';

const METRIC_LABELS: Record<string, string> = {
  focus: 'Sharpness & Focus',
  brightness: 'Illumination / Exposure',
  contrast: 'Contrast Balance',
  fov: 'Field of View (Framing)',
};

const RECAPTURE_REASONS: Record<string, { title: string; instruction: string }> = {
  too_dark: {
    title: 'Image Too Dark',
    instruction: 'Retinal illumination is insufficient. Please increase illumination and ensure the camera flash is properly synchronized.',
  },
  overexposed_glare: {
    title: 'Overexposed / Flash Glare',
    instruction: 'Image has excessive brightness or corneal flash reflection. Reduce illumination or adjust camera angle.',
  },
  blurry_recapture_recommended: {
    title: 'Out of Focus / Blurry',
    instruction: 'Image sharpness is below diagnostic threshold. Please clean the camera lens, stabilize the device, and refocus.',
  },
  poor_framing_or_no_retina_detected: {
    title: 'Insufficient Field of View',
    instruction: 'Retinal region is not adequately visible. Center the optic disc and macula within the capture frame.',
  },
  unreadable_file: {
    title: 'Invalid Image File',
    instruction: 'The uploaded file could not be decoded. Please provide a valid JPEG, PNG, or TIFF fundus image.',
  },
};

export default function CapturePage() {
  const { screening, qualityData, setImage, removeImage, setQuality } = useScreening();
  const nav = useNavigate();
  
  const [activeEye, setActiveEye] = useState<'left' | 'right'>('left');
  const [processingState, setProcessingState] = useState<Record<'left' | 'right', ProcessingState>>({
    left: 'idle',
    right: 'idle',
  });
  const [statusMessage, setStatusMessage] = useState<Record<'left' | 'right', string>>({
    left: '',
    right: '',
  });
  const [showDetails, setShowDetails] = useState<Record<'left' | 'right', boolean>>({
    left: false,
    right: false,
  });

  // Webcam controls
  const [useWebcam, setUseWebcam] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Stop camera when unmounting or switching eyes
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseWebcam(false);
    setCameraError(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(stream);
      setUseWebcam(true);
    } catch (err: any) {
      setCameraError('Unable to access camera or funduscope. Please check device connection or permissions.');
    }
  };

  useEffect(() => {
    if (useWebcam && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [useWebcam, cameraStream]);

  // Handle image capture from file or webcam
  const handleCaptureFile = async (file: File) => {
    if (!file) return;
    stopCamera();

    const previewUrl = URL.createObjectURL(file);
    setImage(activeEye, file, previewUrl);

    if (!screening.screeningId) return;

    const targetEye = activeEye;

    // Step 1: Uploading
    setProcessingState(prev => ({ ...prev, [targetEye]: 'uploading' }));
    setStatusMessage(prev => ({ ...prev, [targetEye]: 'Uploading retinal photograph…' }));

    try {
      await uploadImage(screening.screeningId, targetEye, file);

      // Step 2: Automatic Quality Assessment
      setProcessingState(prev => ({ ...prev, [targetEye]: 'assessing' }));
      setStatusMessage(prev => ({ ...prev, [targetEye]: 'Analyzing image quality (focus, illumination, contrast, framing)…' }));

      const qResult = await assessQuality(screening.screeningId, targetEye);
      
      const eyeData = qResult[targetEye];
      if (eyeData?.enhanced) {
        setProcessingState(prev => ({ ...prev, [targetEye]: 'enhancing' }));
        setStatusMessage(prev => ({ ...prev, [targetEye]: 'Image borderline — CLAHE enhancement applied & re-assessed.' }));
        setTimeout(() => {
          setQuality(qResult);
          setProcessingState(prev => ({ ...prev, [targetEye]: 'done' }));
        }, 600);
      } else {
        setQuality(qResult);
        setProcessingState(prev => ({ ...prev, [targetEye]: 'done' }));
      }
    } catch (err: any) {
      console.error('Upload / quality check failed:', err);
      setProcessingState(prev => ({ ...prev, [targetEye]: 'error' }));
      setStatusMessage(prev => ({ ...prev, [targetEye]: 'Quality assessment service error. You may retry or continue.' }));
    }
  };

  const captureFrameFromWebcam = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (blob) {
        const file = new File(
          [blob],
          `${activeEye}_retina_${Date.now()}.jpg`,
          { type: 'image/jpeg' }
        );
        handleCaptureFile(file);
      }
    }, 'image/jpeg', 0.96);
  };

  // Recapture action for current eye
  const handleRecapture = (eye: 'left' | 'right') => {
    stopCamera();
    removeImage(eye);
    setProcessingState(prev => ({ ...prev, [eye]: 'idle' }));
    setStatusMessage(prev => ({ ...prev, [eye]: '' }));
    setShowDetails(prev => ({ ...prev, [eye]: false }));
  };

  // Current active eye variables
  const currentPreview = activeEye === 'left' ? screening.leftPreviewUrl : screening.rightPreviewUrl;
  const currentQuality = qualityData?.[activeEye];
  const currentProcessing = processingState[activeEye];

  // Opposing eye status
  const otherEye = activeEye === 'left' ? 'right' : 'left';
  const otherPreview = otherEye === 'left' ? screening.leftPreviewUrl : screening.rightPreviewUrl;
  const otherQuality = qualityData?.[otherEye];

  // Can proceed if at least one eye has an accepted image (or both)
  const leftAccepted = qualityData?.left && qualityData.left.status !== 'ungradable';
  const rightAccepted = qualityData?.right && qualityData.right.status !== 'ungradable';
  const canProceed = Boolean(leftAccepted || rightAccepted);

  // Status helper for tabs
  const getTabStatus = (eye: 'left' | 'right') => {
    const preview = eye === 'left' ? screening.leftPreviewUrl : screening.rightPreviewUrl;
    const q = qualityData?.[eye];
    const proc = processingState[eye];

    if (proc === 'uploading' || proc === 'assessing' || proc === 'enhancing') {
      return { label: 'Analyzing…', tone: 'info', icon: <Sparkles size={12} className="spin-slow" /> };
    }
    if (!preview) {
      return { label: 'Not Captured', tone: 'neutral', icon: null };
    }
    if (!q) {
      return { label: 'Captured', tone: 'neutral', icon: <Check size={12} /> };
    }
    if (q.status === 'ungradable') {
      return { label: 'Recapture Required', tone: 'danger', icon: <XCircle size={12} /> };
    }
    if (q.enhanced) {
      return { label: 'Accepted (Enhanced)', tone: 'good', icon: <Zap size={12} /> };
    }
    return { label: 'Quality Passed', tone: 'good', icon: <CheckCircle2 size={12} /> };
  };

  const leftTab = getTabStatus('left');
  const rightTab = getTabStatus('right');

  return (
    <>
      <SectionHeader 
        title="Retinal Capture & Quality Assessment" 
        description="Capture or upload fundus photographs with real-time automated quality verification."
      />
      <Stepper active={2} />

      {/* Patient & Longitudinal Follow-up Header */}
      {screening.patientName && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: screening.isFollowUp ? '#f0f9ff' : '#ffffff',
          border: screening.isFollowUp ? '1px solid #bae6fd' : '1px solid var(--line)',
          borderRadius: 14,
          padding: '12px 20px',
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: screening.isFollowUp ? '#e0f2fe' : 'var(--primary-2)',
              color: screening.isFollowUp ? '#0284c7' : 'var(--primary)',
              display: 'grid',
              placeItems: 'center'
            }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <span style={{ 
                fontSize: 10.5, 
                fontWeight: 800, 
                color: screening.isFollowUp ? '#0369a1' : 'var(--muted)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.06em' 
              }}>
                {screening.isFollowUp ? 'Longitudinal Follow-up Examination' : 'Active Patient Examination'}
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 1 }}>
                {screening.patientName} {screening.patientDisplayId ? `· ${screening.patientDisplayId}` : ''}
              </div>
            </div>
          </div>
          {screening.previousExamDate && (
            <div style={{ textAlign: 'right', fontSize: 11.5, color: '#0369a1' }}>
              <div>Baseline Exam: <strong>{screening.previousExamDate}</strong></div>
              <div style={{ fontWeight: 600 }}>Grade: {screening.previousExamGrade || 'Recorded'}</div>
            </div>
          )}
        </div>
      )}

      {/* Eye Selector Tabs */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: '8px 12px',
        marginBottom: 20,
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { stopCamera(); setActiveEye('left'); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 10,
              border: activeEye === 'left' ? '2px solid var(--primary)' : '1px solid var(--line)',
              background: activeEye === 'left' ? 'var(--primary-2)' : '#ffffff',
              color: activeEye === 'left' ? 'var(--primary)' : 'var(--muted)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <Eye size={16} />
            Left Eye (OS)
            <Badge tone={leftTab.tone as any}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {leftTab.icon}
                {leftTab.label}
              </span>
            </Badge>
          </button>

          <button
            onClick={() => { stopCamera(); setActiveEye('right'); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 10,
              border: activeEye === 'right' ? '2px solid var(--primary)' : '1px solid var(--line)',
              background: activeEye === 'right' ? 'var(--primary-2)' : '#ffffff',
              color: activeEye === 'right' ? 'var(--primary)' : 'var(--muted)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <Eye size={16} />
            Right Eye (OD)
            <Badge tone={rightTab.tone as any}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {rightTab.icon}
                {rightTab.label}
              </span>
            </Badge>
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={14} />
          {leftAccepted && rightAccepted
            ? 'Both eyes quality verified — ready for automated AI screening.'
            : leftAccepted || rightAccepted
            ? 'At least one eye is ready for screening. You may capture the other eye or proceed.'
            : 'Capture or upload retinal photographs to initiate real-time quality verification.'}
        </div>
      </div>

      {/* MAIN WORKSPACE FOR SELECTED EYE */}
      <Card style={{ padding: 24, minHeight: 460 }}>
        {!currentPreview ? (
          /* STATE 1: NO IMAGE CAPTURED — CAPTURE / UPLOAD AREA */
          <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>
                {activeEye === 'left' ? 'Left Eye (OS)' : 'Right Eye (OD)'} Retinal Acquisition
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                Upload a fundus image or capture live via an attached funduscope / camera. Quality assessment runs automatically.
              </p>
            </div>

            {/* Webcam / Scope Live View */}
            {useWebcam ? (
              <div style={{
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#09141c',
                border: '2px solid var(--primary)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                marginBottom: 16
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', maxHeight: 360, objectFit: 'contain', display: 'block' }}
                />
                <div style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(9, 20, 28, 0.75)',
                  color: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.2s infinite' }} />
                  Live Camera Feed · {activeEye === 'left' ? 'Left Eye' : 'Right Eye'}
                </div>

                <div style={{
                  position: 'absolute',
                  bottom: 16,
                  left: 0,
                  right: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 12,
                  zIndex: 10
                }}>
                  <Button variant="primary" onClick={captureFrameFromWebcam} style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
                    <Camera size={16} /> Snap Retinal Photo
                  </Button>
                  <Button variant="secondary" onClick={stopCamera}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Drag & Drop Upload Zone */
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleCaptureFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => document.getElementById(`upload-${activeEye}-input`)?.click()}
                style={{
                  border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--line)',
                  background: isDragging ? 'var(--primary-2)' : '#fbfdfd',
                  borderRadius: 16,
                  padding: '40px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  marginBottom: 16
                }}
              >
                <input
                  id={`upload-${activeEye}-input`}
                  type="file"
                  accept="image/jpeg,image/png,image/bmp,image/tiff"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleCaptureFile(e.target.files[0]);
                    }
                  }}
                />

                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: 'var(--primary-2)',
                  color: 'var(--primary)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 14px auto'
                }}>
                  <Upload size={26} />
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                  Drag &amp; drop {activeEye === 'left' ? 'Left' : 'Right'} eye photograph here
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  or click to select file from your workstation
                </div>
                <div style={{ fontSize: 11, color: '#8aa1a1', marginTop: 10 }}>
                  Supports high-res JPEG, PNG, TIFF · Optic disc &amp; macula centered
                </div>
              </div>
            )}

            {cameraError && (
              <div style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertTriangle size={15} />
                {cameraError}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() => document.getElementById(`upload-${activeEye}-input`)?.click()}
              >
                <Upload size={15} /> Select Image File
              </Button>
              <Button
                variant="secondary"
                onClick={() => { if (useWebcam) stopCamera(); else startCamera(); }}
              >
                <Camera size={15} /> {useWebcam ? 'Close Camera' : 'Live Camera / Scope'}
              </Button>
            </div>
          </div>
        ) : (
          /* STATE 2: IMAGE CAPTURED — PREVIEW & AUTOMATIC QUALITY ASSESSMENT */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(360px, 1fr)', gap: 24, alignItems: 'start' }}>
              
              {/* Left Column: Image Preview with Status Badge & Recapture Button */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {activeEye === 'left' ? 'Left Eye (OS)' : 'Right Eye (OD)'} Retinal Photograph
                  </span>
                  <button
                    onClick={() => handleRecapture(activeEye)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <RotateCcw size={13} />
                    Recapture Image
                  </button>
                </div>

                <div className="retina-frame" style={{
                  minHeight: 320,
                  maxHeight: 440,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <img
                    src={currentPreview}
                    alt={`${activeEye} retina preview`}
                    style={{ width: '100%', maxHeight: 440, objectFit: 'contain' }}
                  />
                  <span className="image-tag" style={{ textTransform: 'uppercase' }}>
                    {activeEye === 'left' ? 'Left Eye · OS' : 'Right Eye · OD'}
                  </span>

                  {/* Processing Overlay if currently uploading/assessing */}
                  {(currentProcessing === 'uploading' || currentProcessing === 'assessing' || currentProcessing === 'enhancing') && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(10, 24, 28, 0.78)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      padding: 24,
                      textAlign: 'center'
                    }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        border: '3px solid rgba(255,255,255,0.2)',
                        borderTop: '3px solid #52c8b8',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        marginBottom: 16
                      }} />
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {currentProcessing === 'uploading' && 'Uploading Retinal Photograph…'}
                        {currentProcessing === 'assessing' && 'Analyzing Image Quality…'}
                        {currentProcessing === 'enhancing' && 'Applying Contrast & Illumination Enhancement…'}
                      </div>
                      <div style={{ fontSize: 12, color: '#9cb5b5', marginTop: 6, maxWidth: 360 }}>
                        {statusMessage[activeEye]}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
                  <span>Patient: {screening.patientName || 'Screening Subject'}</span>
                  <span>Acquisition Mode: {useWebcam ? 'Direct Scope' : 'Standard Upload'}</span>
                </div>
              </div>

              {/* Right Column: Automated Quality Assessment Block */}
              <div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Automated Quality Verification
                  </span>
                  <h3 style={{ margin: '2px 0 0', fontSize: 18, color: 'var(--ink)' }}>
                    Image Quality Coach
                  </h3>
                </div>

                {/* State: In Progress */}
                {(currentProcessing === 'uploading' || currentProcessing === 'assessing' || currentProcessing === 'enhancing') && (
                  <div style={{
                    padding: 24,
                    borderRadius: 14,
                    border: '1px solid #cce3e1',
                    background: 'var(--primary-2)',
                    color: 'var(--ink)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sparkles size={20} color="var(--primary)" className="spin-slow" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                        Evaluating clinical screening standards…
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#385558', lineHeight: 1.5 }}>
                      The AI Quality Coach checks focus sharpness, brightness, contrast balance, and retinal field framing before classification.
                    </p>
                  </div>
                )}

                {/* State: Quality Result Available */}
                {currentQuality && currentProcessing !== 'uploading' && currentProcessing !== 'assessing' && currentProcessing !== 'enhancing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* CASE 1: GOOD QUALITY (SUITABLE) */}
                    {currentQuality.status === 'good' && (
                      <div style={{
                        padding: '18px 20px',
                        borderRadius: 14,
                        border: '1px solid #a7f3d0',
                        background: '#f0fdf4',
                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.05)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 size={20} color="#059669" />
                            <strong style={{ fontSize: 15, color: '#065f46' }}>
                              SUITABLE FOR SCREENING
                            </strong>
                          </div>
                          <Badge tone="good">GOOD QUALITY</Badge>
                        </div>
                        <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#047857' }}>
                          This image meets clinical quality standards and is suitable for automated AI analysis.
                        </p>

                        {/* Checklist */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#065f46' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={14} color="#059669" /> Focus: <strong>Good ({Math.round(currentQuality.scores.focus)}/100)</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={14} color="#059669" /> Exposure: <strong>Good ({Math.round(currentQuality.scores.brightness)}/100)</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={14} color="#059669" /> Contrast: <strong>Good ({Math.round(currentQuality.scores.contrast)}/100)</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={14} color="#059669" /> Field of View: <strong>Good ({Math.round(currentQuality.scores.fov)}/100)</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CASE 2: BORDERLINE BUT ENHANCED & ACCEPTED */}
                    {currentQuality.status === 'borderline' && (
                      <div style={{
                        padding: '18px 20px',
                        borderRadius: 14,
                        border: '1px solid #fed7aa',
                        background: '#fffbeb',
                        boxShadow: '0 2px 10px rgba(245, 158, 11, 0.05)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {currentQuality.enhanced ? (
                              <Zap size={20} color="#d97706" />
                            ) : (
                              <AlertTriangle size={20} color="#d97706" />
                            )}
                            <strong style={{ fontSize: 15, color: '#92400e' }}>
                              {currentQuality.enhanced ? 'QUALITY ACCEPTED (ENHANCED)' : 'BORDERLINE QUALITY ACCEPTED'}
                            </strong>
                          </div>
                          <Badge tone="warn">{currentQuality.enhanced ? 'ENHANCED' : 'BORDERLINE'}</Badge>
                        </div>
                        <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#b45309' }}>
                          {currentQuality.enhanced
                            ? 'Borderline image clarity was automatically improved using CLAHE and illumination correction. The image is acceptable for screening.'
                            : 'Image clarity meets the minimum acceptable threshold for screening.'}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#92400e' }}>
                          <div>Focus: <strong>{Math.round(currentQuality.scores.focus)}/100</strong></div>
                          <div>Exposure: <strong>{Math.round(currentQuality.scores.brightness)}/100</strong></div>
                          <div>Contrast: <strong>{Math.round(currentQuality.scores.contrast)}/100</strong></div>
                          <div>Field of View: <strong>{Math.round(currentQuality.scores.fov)}/100</strong></div>
                        </div>
                      </div>
                    )}

                    {/* CASE 3: UNGRADABLE (FAILED QUALITY — RECAPTURE REQUIRED) */}
                    {currentQuality.status === 'ungradable' && (
                      <div style={{
                        padding: '18px 20px',
                        borderRadius: 14,
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        boxShadow: '0 2px 10px rgba(239, 68, 68, 0.05)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <XCircle size={20} color="#dc2626" />
                            <strong style={{ fontSize: 15, color: '#991b1b' }}>
                              IMAGE NOT SUITABLE FOR SCREENING
                            </strong>
                          </div>
                          <Badge tone="danger">RECAPTURE REQUIRED</Badge>
                        </div>

                        {/* Reason and Guidance */}
                        <div style={{ margin: '12px 0 16px', padding: '12px 14px', background: '#ffffff', borderRadius: 10, border: '1px solid #fee2e2' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#b91c1c' }}>
                            Reason: {RECAPTURE_REASONS[currentQuality.reason || '']?.title || currentQuality.reason || 'Image Quality Ungradable'}
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.45 }}>
                            {currentQuality.recapture_message || RECAPTURE_REASONS[currentQuality.reason || '']?.instruction || 'Image quality does not meet clinical requirements. Please retake the photograph.'}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <Button
                            variant="danger"
                            onClick={() => handleRecapture(activeEye)}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            <RotateCcw size={15} /> Recapture {activeEye === 'left' ? 'Left Eye' : 'Right Eye'} Now
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Expandable Technical Scores Detail Accordion */}
                    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: '#ffffff', overflow: 'hidden' }}>
                      <button
                        onClick={() => setShowDetails(prev => ({ ...prev, [activeEye]: !prev[activeEye] }))}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#f8faf9',
                          border: 'none',
                          color: 'var(--muted)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <span>Quality Metrics &amp; Diagnostic Details</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
                            Overall: {Math.round(currentQuality.scores.overall)}/100
                          </span>
                          {showDetails[activeEye] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </button>

                      {showDetails[activeEye] && (
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {(['focus', 'brightness', 'contrast', 'fov'] as const).map(metric => {
                            const val = Math.min(100, Math.round(currentQuality.scores[metric] ?? 0));
                            const barColor = val >= 70 ? '#10b981' : val >= 40 ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={metric}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                  <span style={{ color: 'var(--muted)' }}>{METRIC_LABELS[metric]}</span>
                                  <strong style={{ color: barColor, fontFamily: 'var(--font-mono)' }}>{val}/100</strong>
                                </div>
                                <Progress label="" value={val} />
                              </div>
                            );
                          })}
                          <div style={{ fontSize: 11, color: '#7a8d8e', marginTop: 4 }}>
                            Assessment algorithm: Fast ROI mask + Laplacian variance FFT + HSV illumination analysis.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Contextual Action: Switch to other eye if ready, or prompt recapture */}
                    {currentQuality.status !== 'ungradable' && !otherPreview && (
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12
                      }}>
                        <div style={{ fontSize: 12.5, color: '#0369a1' }}>
                          <strong>{activeEye === 'left' ? 'Left' : 'Right'} eye is ready!</strong> Proceed to capture the {otherEye === 'left' ? 'Left Eye (OS)' : 'Right Eye (OD)'}?
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => { stopCamera(); setActiveEye(otherEye); }}
                          style={{ borderColor: '#0284c7', color: '#0284c7', whiteSpace: 'nowrap' }}
                        >
                          Switch to {otherEye === 'left' ? 'Left Eye' : 'Right Eye'} →
                        </Button>
                      </div>
                    )}

                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM GLOBAL ACTION BAR */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 28,
          paddingTop: 18,
          borderTop: '1px solid var(--line)',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <Button
            variant="secondary"
            onClick={() => nav(screening.patientId ? `/screening/new?patientId=${screening.patientId}` : '/screening/new')}
          >
            ← Back to Patient Info
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Informational Status Indicator */}
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
              <div>
                Left: <strong>{leftTab.label}</strong> · Right: <strong>{rightTab.label}</strong>
              </div>
            </div>

            {/* Primary Action Button */}
            <Button
              onClick={() => nav('/screening/analyze')}
              disabled={!canProceed || currentProcessing === 'uploading' || currentProcessing === 'assessing' || currentProcessing === 'enhancing'}
              style={{ minWidth: 200, justifyContent: 'center' }}
            >
              {currentProcessing === 'uploading' || currentProcessing === 'assessing'
                ? 'Assessing Quality…'
                : 'Continue to AI Analysis →'}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
