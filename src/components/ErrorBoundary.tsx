import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-black/40 backdrop-blur-sm rounded-2xl border border-red-500/20 p-6">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
              <p className="text-red-200 text-sm">
                An unexpected error occurred while loading this page.
              </p>
            </div>

            {this.state.error && (
              <div className="mb-6 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-200 font-mono">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <RefreshCw className="h-5 w-5" />
                <span>Try Again</span>
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <Home className="h-5 w-5" />
                <span>Go Home</span>
              </button>
            </div>

            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                <summary className="text-sm font-medium cursor-pointer">Developer Info</summary>
                <pre className="mt-2 text-xs text-gray-300 overflow-auto">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Route-specific error boundary
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log route errors to analytics or error reporting service
        console.error('Route Error:', error, errorInfo);
      }}
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-yellow-400" />
            <h1 className="text-2xl font-bold mb-2">Page Error</h1>
            <p className="text-gray-300 mb-4">This page encountered an error and couldn't load properly.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}