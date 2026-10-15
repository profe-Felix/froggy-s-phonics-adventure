export default function BookPairingControl({ firstPair, totalPages, onChange, isLoading, isSaving, error, disabled }) {
  return (
    <details className="relative shrink-0 text-xs">
      <summary className="cursor-pointer rounded border border-border bg-secondary px-2 py-1 font-bold text-secondary-foreground">
        First pair: {firstPair}–{firstPair + 1}
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[85vw] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xl">
        <label className="flex flex-col gap-2 font-bold">
          First paired page
          <select aria-label="First paired page" value={firstPair} disabled={disabled || isLoading || isSaving} onChange={e => onChange(Number(e.target.value))}
            className="w-full rounded border border-input bg-background px-2 py-2 text-foreground">
            {Array.from({ length: totalPages - 1 }, (_, i) => i + 1).map(page => (
              <option key={page} value={page}>Pages {page}–{page + 1}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-muted-foreground">Uses file page order. Earlier pages stay single; later pages pair from here. Saved for this book.</p>
        <p role="status" className="mt-2 text-muted-foreground">{isSaving ? 'Saving…' : isLoading ? 'Loading…' : ''}</p>
        {error && <p role="alert" className="mt-2 text-destructive">The page pairing could not be loaded or saved. Please try again.</p>}
      </div>
    </details>
  );
}