// Spanish accent / diacritic marker conversions.
// Supabase Storage filenames cannot contain accents, so words are stored using
// a marker convention. These helpers translate between the pretty (displayed)
// form and the marker (filename) form.
//   á -> a..   é -> e..   í -> i..   ó -> o..   ú -> u..
//   ñ -> n..   ü -> u,,
export function markersToPretty(s) {
  return (s || '')
    .replace(/a\.\./g, 'á').replace(/e\.\./g, 'é').replace(/i\.\./g, 'í')
    .replace(/o\.\./g, 'ó').replace(/u\.\./g, 'ú')
    .replace(/n\.\./g, 'ñ')
    .replace(/u,,/g, 'ü');
}

export function prettyToMarkers(s) {
  return (s || '')
    .replace(/á/g, 'a..').replace(/é/g, 'e..').replace(/í/g, 'i..')
    .replace(/ó/g, 'o..').replace(/ú/g, 'u..')
    .replace(/ñ/g, 'n..').replace(/ü/g, 'u,,');
}

// Strip to plain lowercase ascii (used to match words ignoring accents/case).
export function normalizeName(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n').replace(/ü/g, 'u')
    .replace(/[^a-z]/g, '');
}