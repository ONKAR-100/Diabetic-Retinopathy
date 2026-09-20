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

  // Derive direct authenticated URL if it is a protected media route
  const getDirectAuthenticatedUrl = (rawSrc?: string): string | undefined => {
    if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
      return rawSrc;
    }

    let clean = rawSrc.replace(/\\/g, '/');
    const staticIdx = clean.indexOf('static/');
    if (staticIdx !== -1) {
      clean = `/api/media/${clean.slice(staticIdx + 7).replace(/^\/+/, '')}`;
    }

    // Remote URLs that are not /api/media/ (e.g. Supabase signed URLs) can be fetched directly
    if ((clean.startsWith('http://') || clean.startsWith('https://')) && !clean.includes('/api/media/')) {
      return clean;
    }

    // Append token query parameter for protected media
    const token = typeof window !== 'undefined' ? localStorage.getItem('retinaai_token') : null;
    if (token && (clean.includes('/api/media/') || clean.startsWith('/api/') || !clean.startsWith('http'))) {
      if (!clean.includes('token=')) {
        const sep = clean.includes('?') ? '&' : '?';
        return `${clean}${sep}token=${encodeURIComponent(token)}`;
      }
    }
    return clean;
  };

  const authenticatedUrl = getDirectAuthenticatedUrl(src);
  const authenticatedFallback = getDirectAuthenticatedUrl(fallback);

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

    // If direct authenticated URL is constructed with a token query param, browser handles it directly
    if (authenticatedUrl && authenticatedUrl.includes('token=')) {
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
  }, [src, fallback, authenticatedUrl]);

  // Determine what image source to render safely
  const effectiveSrc = hasError
    ? (authenticatedFallback || fallback)
    : blobUrl
    ? blobUrl
    : (authenticatedUrl || authenticatedFallback || fallback);

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
