import { useState, useEffect, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import BackButton from '@/components/ui/BackButton';
import { SB_URL } from '@/lib/supabaseStorage';

// Letter Sort ("Clasificador de letras") — a faithful wrapper around the
// original self-contained reference tool (hosted at /lettersort/index.html).
// Every sort type is driven by URL params; this page builds those params from
// a teacher/student selector and renders the activity in an iframe. The
// selector is shown to BOTH roles (teacher sets a default, students can change).
const PRESETS_URL = `${SB_URL}/storage/v1/object/public/app-presets/lettersort/presets.json`;

// mode.mode === null  -> classic columns (no ?mode= param), uses field params
const MODES = [
  { key: 'letters', label: 'Letras iniciales', mode: null, fields: ['letters', 'per'] },
  { key: 'randinit', label: 'Sonido inicial aleatorio', mode: 'randinit', fields: ['pool', 'per'] },
  { key: 'syllables', label: 'Sílabas objetivo', mode: null, fields: ['syllables', 'syllmatch', 'syllcmp', 'per'] },
  { key: 'syllcount', label: 'Conteo de sílabas', mode: null, fields: ['counts', 'per'] },
  { key: 'phonemes', label: 'Conteo de sonidos', mode: null, fields: ['phonemes', 'per'] },
  { key: 'stress', label: 'Sílaba tónica', mode: null, fields: ['stress', 'per'] },
  { key: 'stressreveal', label: 'Sílaba tónica (revelar)', mode: 'stressreveal', fields: ['stress', 'words', 'bg'] },
  { key: 'sort', label: 'Ordenar palabras', mode: 'sort', fields: ['words', 'layout', 'direction', 'bottom', 'top', 'left', 'right'] },
  { key: 'manualsort', label: 'Clasificación manual', mode: 'manualsort', fields: ['headers', 'answers', 'headertype', 'cardtype', 'layout'] },
  { key: 'row', label: 'Modo filas', mode: 'row', fields: ['rows', 'rowtitle'] },
  { key: 'rowalli', label: 'Aliteración por filas', mode: 'rowalli', fields: ['rows', 'rowtitle'] },
  { key: 'allisyll', label: 'Sílabas iniciales por filas', mode: 'allisyll', fields: ['rows', 'rowtitle'] },
  { key: 'rowsyll', label: 'Sílabas (inicio/final) por filas', mode: 'rowsyll', fields: ['rows', 'words', 'rowtitle'] },
  { key: 'rowsyllcols', label: 'Columnas de sílabas', mode: 'rowsyllcols', fields: ['rowsyll', 'words', 'headertype', 'cardtype', 'match', 'layout', 'distractors'] },
  { key: 'syllgroups', label: 'Grupos de sílabas', mode: 'syllgroups', fields: ['groups', 'words', 'titles'] },
  { key: 'generate', label: 'Generar palabras', mode: 'generate', fields: ['riddle', 'columns', 'rowsGen', 'slots'] },
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
  rows: { label: 'Filas', type: 'textarea', ph: 'gato~perro,gato; ...  (o  ma:init;pa:final)' },
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

function paramOf(fieldKey) { return FIELDS[fieldKey]?.param || fieldKey; }

function buildQuery(modeKey, vals, preset) {
  if (preset) return `preset=${encodeURIComponent(preset)}`;
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
  // infer mode key from ?mode= or from present params
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

export default function LetterSort() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const initial = useMemo(readInitialState, []);
  const [modeKey, setModeKey] = useState(initial.modeKey);
  const [vals, setVals] = useState(initial.vals);
  const [preset, setPreset] = useState(initial.preset);
  const [presets, setPresets] = useState({});
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    fetch(PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => { if (obj) setPresets(obj); })
      .catch(() => {});
  }, []);

  const query = useMemo(() => buildQuery(modeKey, vals, preset), [modeKey, vals, preset]);
  const frameSrc = `/lettersort/index.html?${query}`;

  // keep the page URL in sync so refresh / share preserves the current config
  useEffect(() => {
    const role = isTeacher ? 'teacher' : 'student';
    const u = `${window.location.pathname}?role=${role}&${query}`;
    window.history.replaceState(null, '', u);
  }, [query, isTeacher]);

  const setField = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const mode = MODES.find((m) => m.key === modeKey);

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
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600">Preset</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white min-w-[180px]"
            >
              <option value="">— ninguno —</option>
              {Object.keys(presets).map((k) => (
                <option key={k} value={k}>{presets[k].label || k}</option>
              ))}
            </select>
          </div>

          {!preset && mode.fields.map((f) => {
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
                  <input type={cfg.type} value={vals[f] || ''} onChange={(e) => setField(f, e.target.value)} placeholder={cfg.ph} className="px-2 py-2 rounded-lg border bg-white min-w-[140px]" />
                )}
              </div>
            );
          })}
        </div>

        {!preset && (
          <div className="max-w-4xl mx-auto mt-3 flex flex-wrap gap-3 items-center">
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

      <iframe key={frameSrc} src={frameSrc} title="Clasificador de letras" className="flex-1 w-full border-0" style={{ minHeight: '70vh' }} />

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