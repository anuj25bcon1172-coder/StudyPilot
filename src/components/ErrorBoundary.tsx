import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          displayMsg = `Database permission or sync issue (${parsed.operationType || 'operation'}): ${parsed.error}`;
        }
      } catch {
        // Plain error message
      }

      return (
        <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#EAECEF] rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#16192C]">Something went wrong</h2>
            <p className="mt-2 text-sm text-[#5A607F] leading-relaxed break-words">
              {displayMsg}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-5 px-4 py-2 rounded-xl bg-[#6C5CE7] text-white text-sm font-medium hover:bg-[#5B4BD5] transition-colors cursor-pointer"
            >
              Return to Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
