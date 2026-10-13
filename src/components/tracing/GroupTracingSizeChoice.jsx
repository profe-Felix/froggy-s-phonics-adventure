export default function GroupTracingSizeChoice({ value, onChange, rewards }) {
  return (
    <div role="group" aria-label="Tracing size" className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
      {['medium', 'big'].map(mode => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition ${
            value === mode ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {mode === 'medium' ? 'Medium' : 'Big'}
          <span className="ml-2 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-black text-secondary-foreground">+{rewards[mode]}</span>
        </button>
      ))}
    </div>
  );
}