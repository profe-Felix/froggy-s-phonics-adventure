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

/**
 * Remove a suffix ONLY when it appears at the end
 * of the name.
 *
 * Examples:
 * Ignacio Hernandez JR. -> Ignacio Hernandez
 * John Smith III -> John Smith
 */
function removeEndingSuffix(tokens) {
  if (!tokens.length) return tokens;

  const suffixes = new Set([
    'jr',
    'sr',
    'ii',
    'iii',
    'iv',
    'v'
  ]);

  const cleaned = [...tokens];

  if (suffixes.has(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }

  return cleaned;
}

/**
 * Match a Clever badge name to a roster name.
 *
 * Clever includes the student's first name and all surname(s),
 * but may omit middle names/initials.
 *
 * Examples:
 *
 * Clever: Maria Rodriguez Hernandez
 * Roster: Maria A Rodriguez Hernandez
 * MATCH
 *
 * Clever: Jose Garcia Lopez
 * Roster: Jose Miguel Garcia Lopez
 * MATCH
 *
 * Clever: Ignacio Hernandez
 * Roster: Ignacio Hernandez JR.
 * MATCH
 */
export function cleverNamesMatch(cleverName, rosterName) {
  const cleverComma = splitCommaName(cleverName);
  const rosterComma = splitCommaName(rosterName);

  let cleverFirst;
  let cleverSurnames;

  if (cleverComma) {
    cleverFirst = cleverComma.first;
    cleverSurnames = removeEndingSuffix(
      cleverComma.surnames
    );
  } else {
    let parts = nameTokens(cleverName);

    parts = removeEndingSuffix(parts);

    if (parts.length < 2) return false;

    cleverFirst = parts[0];
    cleverSurnames = parts.slice(1);
  }

  if (!cleverFirst || !cleverSurnames.length) {
    return false;
  }

  // If roster is written as:
  // Rodriguez Hernandez, Maria A
  //
  // the comma tells us exactly which pieces are surnames.
  if (rosterComma) {
    const rosterSurnames =
      removeEndingSuffix(rosterComma.surnames);

    return (
      rosterComma.first === cleverFirst &&
      rosterSurnames.length === cleverSurnames.length &&
      rosterSurnames.every(
        (token, i) => token === cleverSurnames[i]
      )
    );
  }

  let rosterParts = nameTokens(rosterName);

  // ONLY remove suffix from the very end.
  rosterParts = removeEndingSuffix(rosterParts);

  if (rosterParts.length < 2) return false;

  // First name must match.
  if (rosterParts[0] !== cleverFirst) return false;

  // The END of the roster name must exactly equal
  // all surnames supplied by Clever.
  //
  // This allows anything between the first name and surnames
  // to be treated as a middle name/initial.
  if (
    rosterParts.length <
    1 + cleverSurnames.length
  ) {
    return false;
  }

  const rosterSurnameSuffix =
    rosterParts.slice(-cleverSurnames.length);

  return rosterSurnameSuffix.every(
    (token, i) => token === cleverSurnames[i]
  );
}


// ---------------------------------------------------------
// Existing general name functions
// ---------------------------------------------------------

export function parseName(full) {
  const trimmed = String(full || '').trim();

  if (!trimmed) {
    return { first: '', last: '', key: '' };
  }

  let first = '';
  let last = '';

  if (trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      last = parts[0].split(/\s+/)[0];
      first = parts[1].split(/\s+/)[0];
    } else {
      last = parts[0].split(/\s+/)[0];
    }
  } else {
    const parts = trimmed.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      first = parts[0];
    } else {
      first = parts[0];
      last = parts.slice(1).join(' ');
    }
  }

  const nf = norm(first);
  const nl = norm(last);

  return {
    first,
    last,
    key: nf + '|' + nl
  };
}

export function namesMatch(a, b) {
  const pa = parseName(a);
  const pb = parseName(b);

  if (!pa.key || !pb.key) return false;

  return pa.key === pb.key;
}

export function parseFilename(filename) {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .trim();

  if (/^\d+$/.test(base)) {
    return {
      type: 'id',
      value: base
    };
  }

  const sepParts = base
    .split(/[\s_\-\.]+/)
    .filter(Boolean);

  if (sepParts.length >= 2) {
    return {
      type: 'name',
      first: sepParts[0],
      last: sepParts.slice(1).join('')
    };
  }

  const cleaned = base.replace(/[^a-zA-Z]/g, '');

  const parts = cleaned
    .split(/(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      type: 'name',
      first: parts[0],
      last: parts.slice(1).join('')
    };
  }

  return {
    type: 'name',
    first: base,
    last: ''
  };
}