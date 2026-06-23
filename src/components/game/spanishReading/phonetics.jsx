// ── Spanish phonetics: tokenization + color classification ──────────────────

// Digraphs that act as a single phoneme (longest first for greedy matching)
const DIGRAPHS = ['güe', 'güi', 'gue', 'gui', 'ch', 'qu', 'gu', 'gü', 'll', 'rr'];

const VOWELS = 'aeiouáéíóúüAEIOUÁÉÍÓÚÜ';

/**
 * Split a word into phonemic tokens (digraphs first, then single chars).
 * Preserves original casing.
 * e.g. "Llama" → ["Ll", "a", "m", "a"]
 *      "queso" → ["qu", "e", "s", "o"]
 *      "pingüino" → ["p", "i", "n", "gü", "i", "n", "o"]
 */
export function tokenizeWord(word) {
  const lower = word.toLowerCase();
  const tokens = [];
  let i = 0;
  while (i < lower.length) {
    let found = false;
    for (const dg of DIGRAPHS) {
      if (lower.startsWith(dg, i)) {
        tokens.push(word.slice(i, i + dg.length));
        i += dg.length;
        found = true;
        break;
      }
    }
    if (!found) {
      tokens.push(word[i]);
      i++;
    }
  }
  return tokens;
}

/**
 * Classify each character in a token with a phonetic color.
 * Returns array of { char, color } where color is 'green' | 'red' | 'grey'.
 *
 * Rules (combined from user's three options):
 * - Grey (silent): h always; u in qu/gu before e/i
 * - Red (stop/plosive): p, b, t, d, k, q; hard c (before a/o/u); hard g (before a/o/u)
 * - Green (continuous/voiced/soft): vowels; m, n, ñ, l, r, s, f, j, y;
 *   soft c (before e/i); soft g (before e/i); ch, ll, rr
 */
export function classifyToken(token, nextToken) {
  const lower = token.toLowerCase();
  const nextLower = nextToken?.[0]?.toLowerCase() || '';

  // ── Multi-char digraphs ──
  if (lower === 'ch') {
    return [{ char: token[0], color: 'green' }, { char: token[1], color: 'green' }];
  }
  if (lower === 'll') {
    return [{ char: token[0], color: 'green' }, { char: token[1], color: 'green' }];
  }
  if (lower === 'rr') {
    return [{ char: token[0], color: 'green' }, { char: token[1], color: 'green' }];
  }
  if (lower === 'qu') {
    // q sounds like /k/ (stop) → red; u is silent → grey
    return [{ char: token[0], color: 'red' }, { char: token[1], color: 'grey' }];
  }
  if (lower === 'gu') {
    // Before e/i: g is soft (green), u is silent (grey)
    // Before a/o/u: g is hard (red), u is a vowel (green)
    if ('eéií'.includes(nextLower)) {
      return [{ char: token[0], color: 'green' }, { char: token[1], color: 'grey' }];
    }
    return [{ char: token[0], color: 'red' }, { char: token[1], color: 'green' }];
  }
  if (lower === 'gü') {
    // gü before e/i: g is hard (red), ü is pronounced vowel (green)
    return [{ char: token[0], color: 'red' }, { char: token[1], color: 'green' }];
  }
  if (lower === 'gue' || lower === 'gui') {
    // g soft (green), u silent (grey), e/i vowel (green)
    return [
      { char: token[0], color: 'green' },
      { char: token[1], color: 'grey' },
      { char: token[2], color: 'green' },
    ];
  }
  if (lower === 'güe' || lower === 'güi') {
    // g hard (red), ü pronounced (green), e/i (green)
    return [
      { char: token[0], color: 'red' },
      { char: token[1], color: 'green' },
      { char: token[2], color: 'green' },
    ];
  }

  // ── Single character tokens ──
  const char = token;
  const lc = lower;

  if (lc === 'h') return [{ char, color: 'grey' }];
  if (VOWELS.includes(lc)) return [{ char, color: 'green' }];

  // c: soft before e/i (green), hard before a/o/u (red)
  if (lc === 'c') {
    if ('eéií'.includes(nextLower)) return [{ char, color: 'green' }];
    return [{ char, color: 'red' }];
  }

  // g: soft before e/i (green), hard before a/o/u (red)
  if (lc === 'g') {
    if ('eéií'.includes(nextLower)) return [{ char, color: 'green' }];
    return [{ char, color: 'red' }];
  }

  // Stop consonants → red
  if ('pbtdkq'.includes(lc)) return [{ char, color: 'red' }];

  // Continuous consonants → green
  if ('mnñlrsfjy'.includes(lc)) return [{ char, color: 'green' }];

  // Default (z, x, w, etc.) → green
  return [{ char, color: 'green' }];
}

/**
 * Parse a text item (word or sentence) into an array of "units".
 * Each unit is one of:
 *   { type: 'token', text, chars: [{char, color}] }  — a phoneme (digraph or single char)
 *   { type: 'space', text, chars }  — whitespace
 *   { type: 'punct', text, chars }  — punctuation
 * Tokens are digraph-aware and fill together as one unit during slide-to-read.
 */
export function parseText(text) {
  const units = [];
  // Split on whitespace and punctuation, keeping delimiters
  const parts = text.split(/(\s+|[.,!?;:¿¡"«»()]+)/).filter(s => s.length > 0);

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      units.push({ type: 'space', text: part, chars: [{ char: part, color: 'grey' }] });
    } else if (/^[.,!?;:¿¡"«»()]+$/.test(part)) {
      units.push({ type: 'punct', text: part, chars: [{ char: part, color: 'grey' }] });
    } else {
      const tokens = tokenizeWord(part);
      tokens.forEach((tok, i) => {
        const chars = classifyToken(tok, tokens[i + 1]);
        units.push({ type: 'token', text: tok, chars });
      });
    }
  }

  return units;
}