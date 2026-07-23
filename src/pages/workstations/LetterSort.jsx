import { useState, useEffect, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import BackButton from '@/components/ui/BackButton';
import { SB_URL } from '@/lib/supabaseStorage';
import LetterSortActivity from '@/components/lettersort/LetterSortActivity';
import { buildConfig } from '@/lib/lettersort/rounds';

// Letter Sort ("Clasificador de letras") — a faithful wrapper around the
// original self-contained reference tool (hosted at /lettersort/index.html).
// Every sort type is driven by URL params; this page builds those params from
// a teacher/student selector and renders the activity in an iframe. The
// selector is shown to BOTH roles (teacher sets a default, students can change).
const PRESETS_URL = `${SB_URL}/storage/v1/object/public/app-presets/lettersort/presets.json`;

// mode.mode === null  -> classic columns (no ?mode= param), uses field params
// `desc` is the short helper shown under the selector (and lives in the guide).
const MODES = [
  { key: 'letters', label: 'Por letra inicial (¿con qué empieza?)', mode: null, fields: ['letters', 'per'], desc: 'Ordena tarjetas por la letra inicial. Útil para correspondencia letra-sonido.' },
  { key: 'randinit', label: 'Por letra inicial al azar', mode: 'randinit', fields: ['pool', 'per'], desc: 'Como "letras iniciales", pero el maestro define un pool de sonidos y la app elige al azar.' },
  { key: 'syllables', label: 'Por sílaba (al inicio o en cualquier posición)', mode: null, fields: ['syllables', 'syllmatch', 'syllcmp', 'per'], desc: 'Ordena por una sílaba objetivo (al inicio o en cualquier posición).' },
  { key: 'syllcount', label: 'Por número de sílabas', mode: null, fields: ['counts', 'per'], desc: 'Ordena palabras según cuántas sílabas tienen.' },
  { key: 'phonemes', label: 'Por número de sonidos (fonemas)', mode: null, fields: ['phonemes', 'per'], desc: 'Ordena palabras según cuántos sonidos (fonemas) tienen.' },
  { key: 'stress', label: 'Por sílaba tónica (aguda/grave/esdrújula)', mode: null, fields: ['stress', 'per'], desc: 'Ordena por la sílaba tónica: aguda (1), grave (2), esdrújula (3).' },
  { key: 'stressreveal', label: 'Tocar la sílaba tónica', mode: 'stressreveal', fields: ['stress', 'words', 'bg'], desc: 'Muestra una escena; el alumno toca la sílaba tónica de cada palabra.' },
  { key: 'sort', label: 'Ordenar en un continuo (de menos a más)', mode: 'sort', fields: ['words', 'layout', 'direction', 'bottom', 'top', 'left', 'right'], desc: 'Ordena una lista en un continuo (ej. menos → más) con etiquetas de dirección.' },
  { key: 'manualsort', label: 'Clasificación libre (tú defines categorías)', mode: 'manualsort', fields: ['headers', 'answers', 'headertype', 'cardtype', 'layout'], desc: 'Clasificación totalmente personalizada: defines encabezados y respuestas.' },
  { key: 'row', label: 'Filas: arrastra la que empieza igual', mode: 'row', fields: ['rows', 'rowtitle'], desc: 'Cada fila muestra una palabra-prompt; el alumno arrastra la opción que empieza con el mismo sonido inicial (una tarjeta por fila).' },
  { key: 'rowalli', label: 'Filas: agrupar por aliteración (mismo sonido)', mode: 'rowalli', fields: ['rows', 'rowtitle'], desc: 'Cada fila agrupa palabras que empiezan con el mismo sonido.' },
  { key: 'allisyll', label: 'Filas: agrupar por sílaba inicial', mode: 'allisyll', fields: ['rows', 'rowtitle'], desc: 'Cada fila agrupa palabras con la misma sílaba inicial.' },
  { key: 'rowsyll', label: 'Filas: sílaba al inicio o al final', mode: 'rowsyll', fields: ['rows', 'words', 'rowtitle'], desc: 'Filas que ordenan por una sílaba al inicio o al final de la palabra.' },
  { key: 'rowsyllcols', label: 'Cuadrícula: filas × columnas de sílabas', mode: 'rowsyllcols', fields: ['rowsyll', 'words', 'headertype', 'cardtype', 'match', 'layout', 'distractors'], desc: 'Cuadrícula filas×columnas de sílabas, con distractores.' },
  { key: 'syllgroups', label: 'Grupos: familias de sílabas', mode: 'syllgroups', fields: ['groups', 'words', 'titles'], desc: 'Agrupa palabras por familias de sílabas con títulos personalizados.' },
  { key: 'generate', label: 'Completar adivinanza (arrastrar respuestas)', mode: 'generate', fields: ['riddle', 'columns', 'rowsGen', 'slots'], desc: 'Genera palabras a partir de adivinanzas/definiciones en espacios por columna.' },
];

const FIELDS = {
  letters: { label: 'Letras', type: 'text', ph: 'a, b, ch' },
  syllables: { label: 'Sílabas', type: 'text', ph: 'ma, pa, sa' },
  syllmatch: { label: 'Coincidencia', type: 'select', options: ['initial', 'any'] },
  syllcmp: { label: 'Comparador', type: 'select', options: ['equals', 'contains', 'prefix', 'suffix'] },
  counts: { label: 'Conteos', type: 'text', ph: '1-3 o 1,2,3' },
  phonemes: { label: 'Sonidos', type: 'text', ph: '3-5' },
  stress: { label: 'Posiciones', type: 'text', ph: '1,2,3' },
  pool: { label: 'Pool de letras', type: 'text', ph: 'b, m, s, ch, ll, rr' },
  per: { label: 'Cartas por columna', type: 'number', ph: '4' },
  words: { label: 'Palabras', type: 'textarea', ph: 'lista separada por comas' },
  rows: { label: 'Filas', type: 'textarea', ph: 'row: prompt~opción; ...  ·  rowsyll: palabra:init;palabra:final' },
  rowsyll: { label: 'Columnas (rowsyll)', type: 'text', ph: 'ma,pa | sa,ta' },
  groups: { label: 'Grupos', type: 'text', ph: 'n | ch | br' },
  headers: { label: 'Encabezados', type: 'text', ph: 'perro,gato' },
  answers: { label: 'Respuestas', type: 'text', ph: 'perro:collar,hueso|gato:leche,raton' },
  headertype: { label: 'Tipo de encabezado', type: 'select', options: ['image', 'text'] },
  cardtype: { label: 'Tipo de tarjeta', type: 'select', options: ['word', 'image'] },
  match: { label: 'Coincidencia', type: 'select', options: ['syllable-start', 'contains', 'word-contains'] },
  layout: { label: 'Disposición', type: 'select', options: ['side', 'top', 'vertical', 'horizontal'] },
  direction: { label: 'Dirección', type: 'select', options: ['bottom-up', 'top-down', 'left-right', 'right-left'] },
  bottom: { label: 'Etiqueta abajo', type: 'text', ph: 'menos' },
  top: { label: 'Etiqueta arriba', type: 'text', ph: 'más' },
  left: { label: 'Etiqueta izquierda', type: 'text', ph: 'menos' },
  right: { label: 'Etiqueta derecha', type: 'text', ph: 'más' },
  distractors: { label: 'Distractores', type: 'number', ph: '0' },
  rowtitle: { label: 'Mostrar título', type: 'toggle', param: 'rowtitle' },
  titles: { label: 'Títulos', type: 'text', ph: 'sí,no,maybe' },
  riddle: { label: 'Adivinanza', type: 'text', ph: 'Texto|oculto|...' },
  columns: { label: 'Columnas', type: 'text', ph: 'A,B' },
  rowsGen: { label: 'Filas por columna', type: 'text', ph: '4', param: 'rows' },
  slots: { label: 'Espacios', type: 'number', ph: '1' },
  bg: { label: 'Imagen de fondo', type: 'text', ph: 'scene.jpg' },
};

const TOGGLES = [
  { key: 'tilesonly', label: 'Solo palabras (sin imágenes)' },
  { key: 'hidewords', label: 'Cubrir palabras (tocar para revelar)' },
  { key: 'splitcards', label: 'Tarjetas divididas (palabra + imagen)' },
  { key: 'hidetitle', label: 'Ocultar títulos de columna' },
  { key: 'emoji', label: 'Etiquetas con emoji' },
];

// Local example presets for modes that have no curated preset in the remote
// presets.json. Selecting one fills the fields (editable) and uses the raw-params
// path, so it works exactly like a teacher-typed config. Marked with `builtin`.
const LOCAL_EXAMPLES = {
  _ex_letters_vocales: { label: 'Ejemplo · vocales y comunes', letters: 'a,e,i,o,u,m,p,s,t', per: 4, builtin: true },
  _ex_randinit_bms: { label: 'Ejemplo · sonidos b, m, s', mode: 'randinit', pool: 'b,m,s,ch', per: 4, builtin: true },
  _ex_stress_all: { label: 'Ejemplo · aguda, grave, esdrújula', stress: '1,2,3', per: 4, builtin: true },
  _ex_stressreveal_12: { label: 'Ejemplo · revelar tónica (1-2)', mode: 'stressreveal', stress: '1,2', words: 'gato,casa,perro,sopa', builtin: true },
  _ex_row_onset: { label: 'Ejemplo · filas: igual sonido inicial', mode: 'row', rows: 'gato~gusano; perro~pez', rowtitle: true, builtin: true },
  _ex_rowalli_mp: { label: 'Ejemplo · aliteración M / P', mode: 'rowalli', rows: 'manzana,mayo,mano; pana,pato,piso', rowtitle: true, builtin: true },
  _ex_allisyll_masa: { label: 'Ejemplo · sílabas ma / sa', mode: 'allisyll', rows: 'mama,mapa,mano; salsa,sapo,sano', rowtitle: true, builtin: true },
};

function paramOf(fieldKey) { return FIELDS[fieldKey]?.param || fieldKey; }

function buildQuery(modeKey, vals, remotePreset) {
  // Only remote presets go through ?preset=KEY. Builtins and manual config use
  // the raw-params path so the iframe never needs to look them up remotely.
  if (remotePreset) return `preset=${encodeURIComponent(remotePreset)}`;
  const mode = MODES.find((m) => m.key === modeKey);
  const parts = [];
  if (mode?.mode) parts.push(`mode=${encodeURIComponent(mode.mode)}`);
  for (const f of mode?.fields || []) {
    const v = vals[f];
    if (v === undefined || v === '' || v === false) continue;
    if (v === true) parts.push(`${paramOf(f)}=true`);
    else parts.push(`${encodeURIComponent(paramOf(f))}=${encodeURIComponent(String(v))}`);
  }
  for (const t of TOGGLES) {
    if (vals[t.key]) {
      if (t.key === 'emoji') parts.push('labelstyle=emoji');
      else parts.push(`${t.key}=true`);
    }
  }
  if (vals.advanced) parts.push(vals.advanced.trim());
  return parts.join('&');
}

function readInitialState() {
  const qs = new URLSearchParams(window.location.search);
  const vals = {};
  for (const k of Object.keys(FIELDS)) {
    const p = paramOf(k);
    const raw = qs.get(p);
    if (raw !== null) {
      if (FIELDS[k].type === 'toggle') vals[k] = raw === 'true';
      else vals[k] = raw;
    }
  }
  for (const t of TOGGLES) {
    const raw = qs.get(t.key);
    if (raw === 'true') vals[t.key] = true;
  }
  if (qs.get('labelstyle') === 'emoji') vals.emoji = true;
  if (qs.get('advanced')) vals.advanced = qs.get('advanced');
  const preset = qs.get('preset') || '';
  const modeParam = (qs.get('mode') || '').toLowerCase();
  let modeKey = MODES[0].key;
  if (modeParam) {
    const found = MODES.find((m) => m.mode === modeParam);
    if (found) modeKey = found.key;
  } else if (!preset) {
    if (qs.get('letters')) modeKey = 'letters';
    else if (qs.get('syllables')) modeKey = 'syllables';
    else if (qs.get('counts') || qs.get('syllcount')) modeKey = 'syllcount';
    else if (qs.get('phonemes') || qs.get('phoneme')) modeKey = 'phonemes';
    else if (qs.get('stress') || qs.get('stresspos')) modeKey = 'stress';
    else modeKey = 'letters';
  }
  return { modeKey, vals, preset };
}

// Map a preset object to one of the MODES keys so the dropdown can be filtered
// by the currently selected sort type. Mirrors readInitialState inference.
function presetModeKey(obj) {
  if (!obj) return null;
  const m = (obj.mode || '').toString().toLowerCase();
  if (m) {
    const found = MODES.find((x) => x.mode === m);
    if (found) return found.key;
  }
  if (obj.letters) return 'letters';
  if (obj.syllables) return 'syllables';
  if (obj.syllcount || obj.counts) return 'syllcount';
  if (obj.phonemes || obj.phoneme) return 'phonemes';
  if (obj.stress || obj.stresspos) return 'stress';
  return null;
}

function presetLabel(obj, key) {
  return (obj && (obj.label || obj.name)) || key;
}

export default function LetterSort() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const initial = useMemo(readInitialState, []);
  const [modeKey, setModeKey] = useState(initial.modeKey);
  const [vals, setVals] = useState(initial.vals);
  const [preset, setPreset] = useState(initial.preset);
  const [presets, setPresets] = useState({});
  const [showQr, setShowQr] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    fetch(PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => { if (obj) setPresets(obj); })
      .catch(() => {});
  }, []);

  // Merge remote presets with local examples (builtins) for modes without any.
  const allPresets = useMemo(() => ({ ...LOCAL_EXAMPLES, ...presets }), [presets]);

  // When presets arrive and a remote preset was loaded from the URL, sync the
  // sort selector to that preset's type so the filtered dropdown shows its group.
  useEffect(() => {
    if (presets && preset && presets[preset]) {
      const mk = presetModeKey(presets[preset]);
      if (mk && mk !== modeKey) setModeKey(mk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets]);

  // Only show presets that match the currently selected sort type, alphabetized.
  const filteredPresetKeys = useMemo(
    () => Object.keys(allPresets)
      .filter((k) => presetModeKey(allPresets[k]) === modeKey)
      .sort((a, b) => presetLabel(allPresets[a], a).localeCompare(presetLabel(allPresets[b], b), 'es')),
    [allPresets, modeKey]
  );

  const isBuiltin = !!preset && !!allPresets[preset]?.builtin;
  // Remote presets go through ?preset=; builtins & manual config use raw params.
  const remotePreset = preset && !isBuiltin ? preset : '';
  const query = useMemo(() => buildQuery(modeKey, vals, remotePreset), [modeKey, vals, remotePreset]);
  const frameSrc = `/lettersort/index.html?${query}`;

  // Normalized config consumed by the native activity. Remote presets use the
  // preset object; builtins & manual config use the (possibly pre-filled) vals.
  const internalMode = MODES.find((m) => m.key === modeKey)?.mode || null;
  const config = useMemo(() => {
    const src = (preset && !isBuiltin && presets[preset]) ? presets[preset] : vals;
    return buildConfig(modeKey, internalMode, src);
  }, [modeKey, internalMode, preset, isBuiltin, presets, vals]);

  // keep the page URL in sync so refresh / share preserves the current config
  useEffect(() => {
    const role = isTeacher ? 'teacher' : 'student';
    const u = `${window.location.pathname}?role=${role}&${query}`;
    window.history.replaceState(null, '', u);
  }, [query, isTeacher]);

  const setField = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const mode = MODES.find((m) => m.key === modeKey);
  // Show the editable fields for manual config AND for builtins (pre-filled).
  const showFields = !preset || isBuiltin;

  const onPresetChange = (k) => {
    setPreset(k);
    if (!k) return;
    const obj = allPresets[k];
    const mk = presetModeKey(obj);
    if (mk && mk !== modeKey) setModeKey(mk);
    if (obj?.builtin && mk) {
      // Pre-fill the fields for this mode so the teacher can tweak them.
      const m = MODES.find((mm) => mm.key === mk);
      const mv = { ...vals };
      for (const f of (m?.fields || [])) if (obj[f] !== undefined) mv[f] = obj[f];
      for (const t of TOGGLES) if (obj[t.key] !== undefined) mv[t.key] = obj[t.key];
      setVals(mv);
    }
  };

  const shareUrl = `${window.location.origin}/LetterSort?role=student&${query}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc', fontFamily: "'Andika', system-ui, sans-serif" }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg flex-1">Clasificador de letras</h1>
        {isTeacher && (
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm">📱 QR estudiante</button>
        )}
      </div>

      <div className="p-3 bg-white border-b">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600">Tipo de sort</label>
            <select
              value={modeKey}
              onChange={(e) => { setModeKey(e.target.value); setPreset(''); }}
              className="px-3 py-2 rounded-lg border font-bold bg-white min-w-[220px]"
            >
              {MODES.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
            </select>
            <span className="text-xs text-gray-500 mt-1 max-w-[220px]">{mode?.desc}</span>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600">Preset</label>
            <select
              value={preset}
              onChange={(e) => onPresetChange(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white min-w-[180px]"
            >
              <option value="">— ninguno —</option>
              {filteredPresetKeys.map((k) => (
                <option key={k} value={k}>{presetLabel(allPresets[k], k)}</option>
              ))}
            </select>
          </div>

          {showFields && mode.fields.map((f) => {
            const cfg = FIELDS[f];
            if (!cfg) return null;
            return (
              <div key={f} className="flex flex-col">
                <label className="text-xs font-bold text-gray-600">{cfg.label}</label>
                {cfg.type === 'select' ? (
                  <select value={vals[f] || cfg.options[0]} onChange={(e) => setField(f, e.target.value)} className="px-2 py-2 rounded-lg border bg-white">
                    {cfg.options.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                ) : cfg.type === 'toggle' ? (
                  <label className="px-2 py-2 rounded-lg border bg-white flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!vals[f]} onChange={(e) => setField(f, e.target.checked)} />
                    <span className="text-sm">{cfg.label}</span>
                  </label>
                ) : cfg.type === 'textarea' ? (
                  <textarea value={vals[f] || ''} onChange={(e) => setField(f, e.target.value)} placeholder={cfg.ph} rows={2} className="px-2 py-2 rounded-lg border bg-white min-w-[220px]" />
                ) : (
                  <input type={cfg.type} value={vals[f] ?? ''} onChange={(e) => setField(f, e.target.value)} placeholder={cfg.ph} className="px-2 py-2 rounded-lg border bg-white min-w-[140px]" />
                )}
              </div>
            );
          })}
        </div>

        {showFields && (
          <div className="max-w-4xl mx-auto mt-2">
            <button
              type="button"
              onClick={() => setShowOptions((s) => !s)}
              className="text-xs font-bold text-indigo-700 flex items-center gap-1"
            >
              {showOptions ? '▾' : '▸'} Opciones avanzadas
            </button>
            {showOptions && (
              <div className="mt-2 flex flex-wrap gap-3 items-center">
                {TOGGLES.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!vals[t.key]} onChange={(e) => setField(t.key, e.target.checked)} />
                    {t.label}
                  </label>
                ))}
                <div className="flex flex-col flex-1 min-w-[220px]">
                  <label className="text-xs font-bold text-gray-600">Parámetros avanzados (query extra)</label>
                  <input value={vals.advanced || ''} onChange={(e) => setField('advanced', e.target.value)} placeholder="ej. syllmatch=any&titles=sí,no" className="px-2 py-2 rounded-lg border bg-white" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <LetterSortActivity config={config} query={query} isTeacher={isTeacher} />

      {showQr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Enlace para estudiantes</p>
            <QRCodeCanvas value={shareUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{shareUrl}</p>
            <button onClick={() => setShowQr(false)} className="mt-4 px-4 py-2 rounded-lg border font-bold">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}