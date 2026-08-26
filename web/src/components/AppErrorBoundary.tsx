import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error("Unhandled render error", error, info);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas px-6">
          <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-panel">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-loss">Application error</p>
            <h1 className="mt-3 text-2xl font-semibold text-ink">StockFolio could not load</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Refresh the page. If the problem continues, try again in a few minutes.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

