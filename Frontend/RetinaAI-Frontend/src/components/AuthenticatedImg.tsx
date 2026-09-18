import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

export interface AuthenticatedImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}

export function AuthenticatedImg({
  src,
  alt,
  fallback = '/retina.svg',
  style,
  className,
  onError,
  ...props
}: AuthenticatedImgProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (!src || src === fallback || src.startsWith('data:') || src.startsWith('blob:')) {
      setBlobUrl(null);
      return;
    }

    // Direct remote URLs (e.g. Supabase signed URLs) can be fetched by the browser directly
    if ((src.startsWith('http://') || src.startsWith('https://')) && !src.includes('/api/media/')) {
      setBlobUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    apiClient.get(src, { responseType: 'blob' })
      .then(res => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([res.data]));
        setBlobUrl(objectUrl);
      })
      .catch(err => {
        if (!active) return;
        console.error('Failed to load protected media:', err);
        setHasError(true);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, fallback]);

  const effectiveSrc = hasError
    ? fallback
    : blobUrl
    ? blobUrl
    : (src || fallback);

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      style={style}
      className={className}
      onError={(e) => {
        setHasError(true);
        if (onError) onError(e);
      }}
      {...props}
    />
  );
}

export default AuthenticatedImg;
