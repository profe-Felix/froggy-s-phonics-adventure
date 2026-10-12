import { normalizeSpanish } from '@/lib/literacy/lessonProgression';

// Highlights known sight words in a string. Words matching the `knownWords`
// Set (lowercase, accent-normalized) get a yellow highlighter background.
// Punctuation and spacing are preserved.
export default function HighlightedText({ text, knownWords, className = '' }) {
  if (!text || !knownWords || knownWords.size === 0) {
    return <span className={className}>{text}</span>;
  }

  // Split into word tokens while keeping delimiters attached.
  // Matches sequences of word characters (including Spanish accents/ñ) or
  // sequences of non-word characters (spaces, punctuation).
  const tokens = text.match(/[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\wáéíóúüñÁÉÍÓÚÜÑ]+/g) || [];

  return (
    <span className={className}>
      {tokens.map((token, i) => {
        const normalized = normalizeSpanish(token);
        if (knownWords.has(normalized)) {
          return (
            <mark
              key={i}
              className="rounded px-0.5"
              style={{ backgroundColor: 'rgba(251, 191, 36, 0.45)' }}
            >
              {token}
            </mark>
          );
        }
        return <span key={i}>{token}</span>;
      })}
    </span>
  );
}