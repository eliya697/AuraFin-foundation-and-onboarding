import { Component } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

/**
 * Catches render errors in its subtree so one broken widget never blanks the whole app.
 *
 * - `resetKeys`: when any value changes, the boundary clears itself (e.g. the stage changed).
 * - `fallback`: optional render prop (error, reset) → node. Defaults to a friendly inline card.
 * - `fullScreen`: the top-level variant, offering a full reload.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[AuraFin] ${this.props.label ?? 'View'} crashed:`, error, info?.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (!this.state.error) return;
    const prev = prevProps.resetKeys ?? [];
    const next = this.props.resetKeys ?? [];
    if (prev.length !== next.length || prev.some((value, i) => !Object.is(value, next[i]))) this.reset();
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <ErrorFallback fullScreen={this.props.fullScreen} onRetry={this.reset} />;
  }
}

export function ErrorFallback({ fullScreen = false, onRetry, title = 'משהו השתבש בתצוגה הזו' }) {
  const reload = () => window.location.reload();
  return (
    <div role="alert" className={fullScreen ? 'grid min-h-dvh place-items-center px-4 safe-x' : 'py-2'}>
      <div className="mx-auto w-full max-w-md rounded-[28px] border border-danger/20 bg-surface p-6 text-center shadow-[var(--shadow-soft)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
          <TriangleAlert size={22} />
        </span>
        <p className="mt-3 text-lg font-extrabold text-navy">{title}</p>
        <p className="mt-1 text-sm text-navy-soft">הנתונים שלכם שמורים. אפשר לנסות שוב{fullScreen ? ' או לטעון מחדש' : ''}.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-turquoise px-5 font-bold text-white"
          >
            <RefreshCw size={16} /> נסו שוב
          </button>
          {fullScreen && (
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-12 items-center rounded-2xl border border-navy/10 px-5 font-bold text-navy"
            >
              טעינה מחדש
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
