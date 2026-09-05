function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .trim();
}

function nameTokens(full) {
  return String(full || '')
    .trim()
    .split(/\s+/)
    .map((part) => norm(part))
    .filter(Boolean);
}

function splitCommaName(full) {
  const value = String(full || '').trim();
  if (!value.includes(',')) return null;

  const [lastPart, ...givenParts] = value.split(',');
  const lastTokens = nameTokens(lastPart);
  const givenTokens = nameTokens(givenParts.join(' '));

  if (!givenTokens.length) return null;

  return {
    first: givenTokens[0],
    surnames: lastTokens,
  };
}

function removeEndingSuffix(tokens) {
  if (!tokens.length) return tokens;
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
  const cleaned = [...tokens];
  if (suffixes.has(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }
  return cleaned;
}

export function parseName(full) {
  const comma = splitCommaName(full);
  let first = '';
  let last = '';

  if (comma) {
    first = comma.first;
    last = comma.surnames.join(' ');
  } else {
    const tokens = removeEndingSuffix(nameTokens(full));
    if (tokens.length === 0) {
      first = '';
      last = '';
    } else if (tokens.length === 1) {
      first = tokens[0];
    } else {
      first = tokens[0];
      last = tokens.slice(1).join(' ');
    }
  }

  const nf = norm(first);
  const nl = norm(last);

  return { first, last, key: nf + '|' + nl };
}

export function namesMatch(a, b) {
  const pa = parseName(a);
  const pb = parseName(b);
  if (!pa.key || !pb.key) return false;
  return pa.key === pb.key;
}

export function parseFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  if (/^\d+$/.test(base)) {
    return { type: 'id', value: base };
  }
  const sepParts = base.split(/[\s_\-\.]+/).filter(Boolean);
  if (sepParts.length >= 2) {
    return { type: 'name', first: sepParts[0], last: sepParts.slice(1).join('') };
  }
  const cleaned = base.replace(/[^a-zA-Z]/g, '');
  const parts = cleaned.split(/(?<=[a-z])(?=[A-Z])/).filter(Boolean);
  if (parts.length >= 2) {
    return { type: 'name', first: parts[0], last: parts.slice(1).join('') };
  }
  return { type: 'name', first: base, last: '' };
}