/**
 * Progressive-disclosure error boundary. Replaces a crashing section with a
 * minimalist wireframe fallback instead of white-screening the whole page.
 */
import React from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  label?: string;
  children: React.ReactNode;
  minHeight?: number;
}
interface State { error: Error | null }

export class SectionBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportLovableError(error, { boundary: "SectionBoundary", label: this.props.label, componentStack: info.componentStack });
  }
  reset = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{ minHeight: this.props.minHeight ?? 200 }}
        className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface/40 p-6 text-center"
      >
        <div className="grid w-full max-w-xs grid-cols-6 gap-1 opacity-40">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-2 rounded-sm bg-muted-foreground/30" />
          ))}
        </div>
        <div className="mt-3 text-[13px] font-medium text-foreground">
          {this.props.label ?? "Data unavailable"}
        </div>
        <div className="text-[11px] text-muted-foreground">This section couldn't render. The rest of the page still works.</div>
        <button
          onClick={this.reset}
          className="mt-2 rounded-md border border-border bg-background px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }
}
