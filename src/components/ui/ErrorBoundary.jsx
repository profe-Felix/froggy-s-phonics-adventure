import { Component } from 'react';

// Catches render-time crashes in its children so a single broken component
// shows a friendly recovery screen instead of a blank white page. Students
// tap "Try again" to remount the crashed component without losing their
// login or leaving the lesson.
//
// `resetKey` — when this prop changes, the boundary clears its error state
//   (so navigating away and back, or switching modes, recovers automatically).
// `onBack` — optional callback for a "Back" button on the recovery screen.
// `fallback` — optional render prop: ({ retry, back, error }) => ReactNode.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the crash in the console so the teacher/developer can see what
    // broke, without forcing the student to look at a white screen.
    console.error('ErrorBoundary caught a crash', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { onBack, fallback, children } = this.props;

    if (!error) return children;

    if (typeof fallback === 'function') {
      return fallback({ retry: this.retry, back: onBack, error });
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-50 select-none">
        <div className="text-5xl">🤖</div>
        <h1 className="text-2xl font-black text-slate-800">Oops — something glitched!</h1>
        <p className="text-slate-500 max-w-sm text-sm">
          Your work is safe. Tap "Try again" to keep going. If it keeps happening, ask your teacher.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.retry}
            className="px-6 py-3 rounded-2xl bg-indigo-500 text-white font-bold shadow-md active:scale-95"
          >
            ↻ Try again
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 rounded-2xl bg-white text-slate-600 font-bold border border-slate-200 active:scale-95"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    );
  }
}