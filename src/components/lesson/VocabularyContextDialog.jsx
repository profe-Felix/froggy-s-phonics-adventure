import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, BookOpen, SearchX } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const kinder = { fontFamily: "var(--font-kinder, 'Andika'), 'Andika', sans-serif" };

function errText(e) {
  return e?.message || String(e || 'Something went wrong. Try again.');
}

export default function VocabularyContextDialog({
  item, hit, index = 0, totalLoaded = 0, hasMore = false, loading = false, error = null,
  progress = null, onClose, onPrevious, onNext, onRetry, children,
}) {
  const open = !!item;
  const prevDisabled = loading || index <= 0;
  const nextDisabled = loading || (!hasMore && index >= totalLoaded - 1);
  const isWord = item?.kind === 'word';
  const hasPreview = !!hit && !!children;
  const empty = !loading && !error && !hit;
  const position = totalLoaded > 0 ? `${index + 1} of ${totalLoaded}${hasMore ? '+' : ''}` : null;

  const progressText = progress
    ? (typeof progress === 'string' ? progress
      : progress.total ? `Searching ${progress.completed ?? 0} of ${progress.total}${progress.label ? ` · ${progress.label}` : ''}`
        : progress.label || null)
    : null;
  const pct = progress && typeof progress === 'object' && progress.total
    ? Math.min(100, Math.round(((progress.completed ?? 0) / progress.total) * 100)) : null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose?.(); }}>
      <DialogContent
        data-testid="dialog-vocab-context"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col gap-0 overflow-hidden border-indigo-100 bg-white p-0 sm:h-[92dvh] sm:rounded-2xl [&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:rounded-lg [&>button:last-child]:p-1.5 [&>button:last-child]:text-indigo-700 [&>button:last-child]:opacity-100 [&>button:last-child:hover]:bg-indigo-50"
      >
        {/* Header */}
        <header className="shrink-0 border-b border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white px-4 py-3 pr-12">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <DialogTitle className="text-xl font-normal text-slate-900" style={kinder} data-testid="text-context-item">
              {item?.text}
            </DialogTitle>
            <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              {isWord ? 'Word' : 'Syllable'}
            </span>
            {item && item.original && item.original !== item.text && (
              <span className="text-[11px] text-slate-500">scanned as <s style={kinder}>{item.original}</s></span>
            )}
          </div>
          <DialogDescription className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-600" data-testid="text-context-source">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
            {hit
              ? <span className="truncate" title={hit.bookTitle}><span className="font-bold text-slate-800">{hit.bookTitle}</span> · page {hit.pageNumber}</span>
              : <span>{loading ? 'Finding where this appears in your books…' : 'Original book page preview'}</span>}
          </DialogDescription>
        </header>

        {/* Context sentence */}
        {hit?.contextParts?.length > 0 && (
          <div className="shrink-0 border-b border-indigo-50 bg-white px-4 py-2" data-testid="text-context-snippet">
            <p className="line-clamp-2 text-base leading-relaxed text-slate-700" style={kinder}>
              {hit.contextParts.map((p, i) => p.match
                ? <mark key={i} className="rounded bg-teal-100 px-0.5 text-teal-900 ring-1 ring-teal-300">{p.text}</mark>
                : <span key={i}>{p.text}</span>)}
            </p>
            {hit.matchedWord && hit.matchedWord !== item?.text && (
              <p className="text-[11px] text-slate-500">Found inside <span style={kinder} className="text-indigo-700">{hit.matchedWord}</span></p>
            )}
          </div>
        )}
        {hit?.notice && (
          <p role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900" data-testid="text-context-notice">{hit.notice}</p>
        )}

        {/* Preview area */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-50/70" aria-busy={loading}>
          {hasPreview && (
            <div className={`h-full min-h-0 p-2 transition-opacity duration-200 sm:p-4 ${loading ? 'opacity-40' : 'opacity-100'}`} data-testid="region-page-preview">
              {children}
            </div>
          )}

          {loading && (
            <div className={hasPreview ? 'pointer-events-none absolute inset-x-0 top-3 flex justify-center' : 'flex h-full flex-col items-center justify-center gap-3 p-6'}
              role="status" aria-live="polite" data-testid="status-context-loading">
              {!hasPreview && <div className="w-full max-w-md space-y-2" aria-hidden>
                <div className="h-48 animate-pulse rounded-xl bg-indigo-50" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-indigo-50" />
              </div>}
              <div className="flex min-w-[12rem] flex-col gap-1.5 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-indigo-800 shadow-sm">
                <span className="flex items-center gap-2 font-bold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {progressText || 'Loading occurrence…'}
                </span>
                {pct !== null && <div className="h-1 overflow-hidden rounded-full bg-indigo-100">
                  <div className="h-full origin-left bg-teal-500 transition-transform" style={{ transform: `scaleX(${pct / 100})` }} />
                </div>}
              </div>
            </div>
          )}

          {error && !loading && (
            <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800" data-testid="status-context-error">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" aria-hidden />This occurrence could not load.</p>
              <p className="mt-1 text-xs">{errText(error)} Your place in the review list is kept.</p>
              {onRetry && <button onClick={onRetry} data-testid="button-context-retry"
                className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">Retry</button>}
            </div>
          )}

          {empty && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center" data-testid="status-context-empty">
              <SearchX className="h-8 w-8 text-indigo-300" aria-hidden />
              <p className="text-sm font-bold text-slate-800">No book page found for <span style={kinder} className="font-normal text-indigo-800">{item?.text}</span></p>
              <p className="max-w-sm text-xs text-slate-600">It may come from a book that was removed or rescanned. You can still review it in the list underneath.</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex shrink-0 items-center justify-between gap-2 border-t border-indigo-100 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" aria-label="Occurrences">
          <button onClick={onPrevious} disabled={prevDisabled} data-testid="button-context-previous"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden />Previous
          </button>
          <div className="min-w-0 text-center text-xs" aria-live="polite" data-testid="text-context-position">
            {position ? <span className="font-bold text-slate-800">Occurrence {position}</span> : <span className="text-slate-500">—</span>}
            {hit && <span className="hidden truncate text-slate-500 sm:inline"> · {hit.bookTitle}, p. {hit.pageNumber}</span>}
          </div>
          <button onClick={onNext} disabled={nextDisabled} data-testid="button-context-next"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:opacity-40">
            Next<ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
