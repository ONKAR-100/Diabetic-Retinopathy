import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, RefreshCw, Check } from 'lucide-react';
import { Button } from '../components';

export function ImageUploader({ 
  eye, 
  onFile, 
  preview 
}: { 
  eye: string; 
  onFile: (file: File, previewUrl: string) => void; 
  preview?: string | null; 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [useWebcam, setUseWebcam] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleFile = (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFile(file, url);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setCameraStream(stream);
      setUseWebcam(true);
    } catch (err: any) {
      setCameraError('Unable to access camera. Please check browser permissions or upload from disk.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseWebcam(false);
  };

  useEffect(() => {
    if (useWebcam && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [useWebcam, cameraStream]);

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `${eye.toLowerCase().replace(' ', '_')}_capture.jpg`, { type: 'image/jpeg' });
        const url = URL.createObjectURL(file);
        onFile(file, url);
        stopCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div 
        className={`retina-frame ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onClick={() => !useWebcam && document.getElementById(`upload-${eye}`)?.click()}
        style={{ 
          cursor: useWebcam ? 'default' : 'pointer', 
          border: '2px dashed var(--line)', 
          minHeight: 280,
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          background: '#09141c',
          borderRadius: 18,
          overflow: 'hidden'
        }}
      >
        <input 
          id={`upload-${eye}`} 
          type="file" 
          accept="image/jpeg,image/png,image/bmp,image/tiff" 
          style={{ display: 'none' }} 
          onChange={e => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); }} 
        />

        {useWebcam ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              style={{ width: '100%', height: '100%', maxHeight: 320, objectFit: 'cover' }} 
            />
            <div style={{ position: 'absolute', bottom: 16, display: 'flex', gap: 10, zIndex: 10 }}>
              <Button variant="primary" onClick={() => captureFrame()}>
                <Camera size={16} /> Snap Photo
              </Button>
              <Button variant="secondary" onClick={() => stopCamera()}>
                Cancel
              </Button>
            </div>
          </div>
        ) : preview ? (
          <img src={preview} alt={`${eye} preview`} style={{ width: '100%', height: '100%', maxHeight: 320, objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center', color: '#97afaf', padding: 20 }}>
            <Upload size={38} style={{ marginBottom: 12, color: 'var(--primary)' }} />
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#e6f1f1' }}>
              Drag &amp; drop fundus photograph or click to browse
            </p>
            <span style={{ fontSize: 11, color: '#86a5a5' }}>
              Supports high-res JPEG, PNG, TIFF
            </span>
          </div>
        )}

        <span className="image-tag">{eye}</span>
      </div>

      {cameraError && (
        <div style={{ fontSize: 11, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 12px', borderRadius: 8 }}>
          {cameraError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <Button 
          variant="secondary" 
          onClick={() => document.getElementById(`upload-${eye}`)?.click()}
        >
          <Upload size={15} /> Upload File
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => { if (useWebcam) stopCamera(); else startCamera(); }}
        >
          <Camera size={15} /> {useWebcam ? 'Close Webcam' : 'Use Camera / Scope'}
        </Button>
      </div>
    </div>
  );
}
