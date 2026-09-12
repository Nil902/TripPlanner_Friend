import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { PAPER, INK, BORDER, PINE, MUTED } from '../lib/constants';

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            padding: '24px',
            borderRadius: 12,
            background: PAPER,
            border: `1px solid ${BORDER}`,
            textAlign: 'center',
            color: INK,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <AlertTriangle size={32} color="#C25E3A" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            {this.props.label || 'Something went wrong'}
          </h2>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px' }}>
            {this.state.message || 'An unexpected error occurred while rendering this view.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: PINE,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} /> Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}