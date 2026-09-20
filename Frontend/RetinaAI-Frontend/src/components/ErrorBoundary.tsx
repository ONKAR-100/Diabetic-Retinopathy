import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: 380,
          margin: '32px auto',
          maxWidth: 640,
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #fee2e2',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: '#fef2f2',
            color: '#b73d44',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px'
          }}>
            <AlertCircle size={28} />
          </div>

          <h2 style={{
            fontFamily: 'var(--font-display, inherit)',
            fontSize: 20,
            fontWeight: 700,
            color: '#991b1b',
            margin: '0 0 8px'
          }}>
            {this.props.fallbackTitle || 'Component Rendering Error'}
          </h2>

          <p style={{
            fontSize: 13.5,
            color: '#55696b',
            margin: '0 auto 20px',
            maxWidth: 480,
            lineHeight: 1.55
          }}>
            {this.props.fallbackMessage ||
              'A rendering issue occurred while displaying this clinical section. You can refresh or return to the main dashboard.'}
          </p>

          {this.state.error?.message && (
            <div style={{
              background: '#f8faf9',
              border: '1px solid #e5eded',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#334e51',
              textAlign: 'left',
              marginBottom: 24,
              overflowX: 'auto'
            }}>
              {this.state.error.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: '#0e6264',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              <span>Reload Page</span>
            </button>

            <button
              type="button"
              onClick={this.handleGoHome}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: '#f4fbf9',
                color: '#0e6264',
                border: '1px solid #c3dedd',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Home size={14} />
              <span>Go to Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;

