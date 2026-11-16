import { Component, type ErrorInfo, type ReactNode } from 'react';

// Keeps one failed render from blanking the whole page, and says what failed.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="route-loading" role="alert">
        <p>The dashboard hit an error: {this.state.error.message.split('\n')[0].slice(0, 240)}</p>
        <p>
          <a href="#/app" onClick={() => window.location.reload()}>
            Reload the page
          </a>
        </p>
      </div>
    );
  }
}
