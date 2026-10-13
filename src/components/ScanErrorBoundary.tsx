"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

/** Keeps a render crash on the scan page from blanking the whole screen. */
export class ScanErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return (
      <main className="mx-auto min-h-dvh max-w-phone px-4 py-8">
        <h1 className="text-2xl font-semibold">Scan hit a problem</h1>
        <p className="mt-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral" role="alert">
          {this.state.error.message || "Something went wrong showing that result."} Search by name if it happens again.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 min-h-12 w-full rounded-2xl bg-bolt font-semibold text-ink"
        >
          Show the scan again
        </button>
      </main>
    );
  }
}
