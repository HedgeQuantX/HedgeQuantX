import { Component } from 'react';

/**
 * Global error boundary - prevents blank screen crashes.
 * Critical for live algo trading: a render crash must not leave
 * a running algo without UI to stop it.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
          <div className="bg-bg-card border border-pink/30 rounded-lg p-8 max-w-md text-center">
            <div className="w-12 h-12 rounded-full bg-pink-dim flex items-center justify-center mx-auto mb-4">
              <span className="text-pink text-xl">!</span>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-text-muted mb-6">
              An unexpected error occurred. Your trading session may still be active on the server.
            </p>
            <button
              onClick={this.handleReload}
              className="bg-accent hover:bg-accent/90 text-bg-primary font-bold py-2.5 px-6 rounded-lg text-sm transition-colors cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
