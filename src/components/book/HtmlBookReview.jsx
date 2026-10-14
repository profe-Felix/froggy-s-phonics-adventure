import { useState } from 'react';

/**
 * Review modal shown after parsing SingleFile HTML pages. Lets the teacher
 * verify detected page numbers, reorder pages without detected numbers,
 * and confirm before the book is created.
 */
export default function HtmlBookReview({
  pages,
  bookTitle,
  module,
  uploading,
  onConfirm,
  onCancel,
}) {
  const [ordered, setOrdered] = useState(pages);

  const move = (index, dir) => {
    setOrdered((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const hasMissingNumbers = ordered.some((p) => p.pageNumber == null);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📖</span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-lg text-gray-900 truncate">
              {bookTitle || 'Untitled book'}
            </p>
            <p className="text-sm text-gray-500">
              {ordered.length} HTML {ordered.length === 1 ? 'page' : 'pages'}
              {module ? ` · ${module}` : ''}
            </p>
          </div>
        </div>

        {hasMissingNumbers && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 mb-3">
            <p className="text-xs text-amber-700 font-bold">
              ⚠ Some pages have no detectable page number. They appear at the
              end in upload order — use the arrows to adjust.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-auto flex flex-col gap-2 min-h-0">
          {ordered.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-gray-200 p-2"
            >
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs font-bold"
                >
                  ▲
                </button>
                <button
                  disabled={i === ordered.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs font-bold"
                >
                  ▼
                </button>
              </div>
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                {i + 1}
              </div>
              {p.imageSrc ? (
                <img
                  src={p.imageSrc}
                  alt={p.fileName}
                  className="w-12 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs shrink-0">
                  No img
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {p.fileName}
                </p>
                <p className="text-xs text-gray-500">
                  {p.pageNumber != null
                    ? `Detected page ${p.pageNumber}`
                    : 'No page number detected'}
                  {' · '}
                  {p.words.length} words
                  {' · '}
                  {p.text.length} chars
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4 shrink-0">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="px-5 py-2.5 rounded-xl font-bold text-gray-600 border-2 border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(ordered)}
            disabled={uploading || !bookTitle.trim()}
            className="flex-1 px-5 py-2.5 rounded-xl font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
          >
            {uploading
              ? 'Creating book…'
              : `Create book with ${ordered.length} ${ordered.length === 1 ? 'page' : 'pages'}`}
          </button>
        </div>
        {!bookTitle.trim() && (
          <p className="text-xs text-rose-500 mt-2 text-center">
            Enter a book title first
          </p>
        )}
      </div>
    </div>
  );
}