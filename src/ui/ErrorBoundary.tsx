/**
 * A wall between one broken component and the whole application.
 *
 * React unmounts the entire tree when a render throws, which turns any single mistake into a blank
 * page — and a blank page cannot offer you a way out of whatever caused it. That happened for real:
 * a draft saved in an older shape crashed the builder's form, and clearing the draft needed
 * devtools because nothing was left on screen to click.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown alongside the message: the way out of whatever went wrong. */
  onReset?: () => void;
  resetLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[avd] onderdeel gecrasht', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h2>Er ging hier iets mis</h2>
        <p>
          Dit onderdeel kon niet getekend worden. De rest van de app werkt nog; hieronder staat wat
          er precies misging.
        </p>
        <pre>{error.message}</pre>
        {this.props.onReset && (
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            {this.props.resetLabel ?? 'Opnieuw proberen'}
          </button>
        )}
      </div>
    );
  }
}
