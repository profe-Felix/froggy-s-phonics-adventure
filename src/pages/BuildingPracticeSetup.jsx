import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useBuildingSetup } from '@/hooks/useBuildingPractice';
import { resolveImageForWord } from '@/lib/lettersort/storage';
import '@/components/literacy/building-practice.css';

const LIST_TYPES = [
  { key: 'sight_words', title: 'Palabras de alta frecuencia', help: 'Solo se usarán palabras que ya estén aprobadas para esta posición curricular.' },
  { key: 'syllables', title: 'Sílabas', help: 'Añade sílabas disponibles en el banco de este punto de la lección.' },
  { key: 'words', title: 'Palabras', help: 'Las palabras fuera del banco curricular no se incluirán.' },
];

const DEFAULT_CONFIG = { sight_words: [], syllables: [], words: [], phrases: [] };
const IMAGE_LIBRARY = { bucket: 'lettersort-images', prefix: '' };

function toLines(value) {
  if (Array.isArray(value)) return value.map((entry) => String(typeof entry === 'string' ? entry : entry?.text || '').trim()).filter(Boolean).join('\n');
  return String(value || '');
}

function normalizeList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/\n|,/);
  return [...new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function editablePhrases(phrases) {
  return (Array.isArray(phrases) ? phrases : []).map((phrase, index) => ({
    text: String(phrase?.text || ''),
    imageUrl: String(phrase?.imageUrl || ''),
    searchWord: '',
    editorKey: `loaded-${index}-${phrase?.text || 'phrase'}`,
  }));
}

function targetText(target) {
  if (typeof target === 'string') return target;
  return target?.text || target?.word || target?.value || '';
}

function readableError(value) {
  if (typeof value === 'string') return value;
  return value?.message || 'Ocurrió un error al cargar la información.';
}

export default function BuildingPracticeSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryLessonId = searchParams.get('lessonId') || '';
  const studentId = searchParams.get('studentId') || '';
  const [lessonId, setLessonId] = useState(queryLessonId);
  const { lessons = [], lesson, pools = {}, config = DEFAULT_CONFIG, configHash, loading, busy, error, save } = useBuildingSetup(lessonId || undefined);
  const [draft, setDraft] = useState(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [phraseErrors, setPhraseErrors] = useState({});
  const [searchState, setSearchState] = useState({});

  useEffect(() => {
    if (!lessons.length) return;
    const exists = lessons.some((entry) => String(entry.id) === String(lessonId));
    if (lessonId && exists) return;
    const firstId = String(lessons[0].id);
    setLessonId(firstId);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('lessonId', firstId);
      return next;
    }, { replace: true });
  }, [lessons, lessonId, setSearchParams]);

  useEffect(() => {
    if (dirty) return;
    setDraft({
      sight_words: toLines(config?.sight_words),
      syllables: toLines(config?.syllables),
      words: toLines(config?.words),
      phrases: editablePhrases(config?.phrases),
    });
    setSaved(false);
  }, [configHash, lesson?.id, lessonId]);

  const activeLesson = lesson || lessons.find((entry) => String(entry.id) === String(lessonId));
  const currentPools = useMemo(() => ({
    sight_words: pools?.sight_words || [],
    syllables: pools?.syllables || [],
    words: pools?.words || [],
    phrases: pools?.phrases || [],
  }), [pools]);

  function markChanged() {
    setDirty(true);
    setSaved(false);
    setSaveError('');
  }

  function changeLesson(value) {
    setLessonId(value);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set('lessonId', value);
      else next.delete('lessonId');
      return next;
    });
    setDirty(false);
    setSaved(false);
  }

  function updateList(key, value) {
    markChanged();
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function updatePhrase(index, changes) {
    markChanged();
    setDraft((previous) => ({
      ...previous,
      phrases: previous.phrases.map((phrase, phraseIndex) => phraseIndex === index ? { ...phrase, ...changes } : phrase),
    }));
  }

  function addPhrase() {
    markChanged();
    setDraft((previous) => ({
      ...previous,
      phrases: [...previous.phrases, { text: '', imageUrl: '', searchWord: '', editorKey: `new-${Date.now()}` }],
    }));
  }

  function removePhrase(index) {
    markChanged();
    setDraft((previous) => ({ ...previous, phrases: previous.phrases.filter((_, phraseIndex) => phraseIndex !== index) }));
    setPhraseErrors((previous) => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  }

  async function searchImage(index) {
    const word = draft.phrases[index]?.searchWord?.trim();
    if (!word) {
      setPhraseErrors((previous) => ({ ...previous, [index]: 'Escribe el sustantivo que aparece en la imagen.' }));
      return;
    }
    setPhraseErrors((previous) => ({ ...previous, [index]: '' }));
    setSearchState((previous) => ({ ...previous, [index]: { loading: true, error: '' } }));
    try {
      const result = await resolveImageForWord(word, IMAGE_LIBRARY);
      if (!result?.url) {
        setSearchState((previous) => ({ ...previous, [index]: { loading: false, error: 'No encontramos ese sustantivo en la biblioteca. Puedes escribir una URL HTTPS.' } }));
        return;
      }
      updatePhrase(index, { imageUrl: result.url });
      setSearchState((previous) => ({ ...previous, [index]: { loading: false, error: '' } }));
    } catch {
      setSearchState((previous) => ({ ...previous, [index]: { loading: false, error: 'No se pudo consultar la biblioteca de imágenes. Prueba con una URL HTTPS.' } }));
    }
  }

  async function handleSave() {
    setSaveError('');
    setSaved(false);
    const phraseRows = draft.phrases.map(({ text, imageUrl }) => ({ text: text.trim(), imageUrl: imageUrl.trim() }));
    const invalid = {};
    phraseRows.forEach((phrase, index) => {
      if (!phrase.text) invalid[index] = 'Escribe la frase completa que tú quieres enseñar.';
      else if (!/^https:\/\//i.test(phrase.imageUrl)) invalid[index] = 'Cada frase necesita una imagen de sustantivo con URL HTTPS.';
    });
    setPhraseErrors(invalid);
    if (Object.keys(invalid).length) {
      setSaveError('Revisa las frases marcadas. Cada una necesita texto y una imagen de sustantivo.');
      return;
    }
    const payload = {
      sight_words: normalizeList(draft.sight_words),
      syllables: normalizeList(draft.syllables),
      words: normalizeList(draft.words),
      phrases: phraseRows.filter((phrase) => phrase.text && phrase.imageUrl),
    };
    try {
      const savedSuccessfully = await save(payload);
      if (!savedSuccessfully) return;
      setDraft({
        sight_words: payload.sight_words.join('\n'),
        syllables: payload.syllables.join('\n'),
        words: payload.words.join('\n'),
        phrases: editablePhrases(payload.phrases),
      });
      setDirty(false);
      setSaved(true);
      setPhraseErrors({});
    } catch (error) {
      setSaveError(readableError(error));
    }
  }

  const practiceKinds = [
    ['sight_words', 'Palabras frecuentes'],
    ['syllables', 'Sílabas'],
    ['words', 'Palabras'],
    ['phrases', 'Frases'],
  ];

  return (
    <div className="building-ui building-editor">
      <header className="building-editor-header">
        <Link to="/LessonEditor" className="building-button building-button--soft" data-testid="link-back-lesson-editor" aria-label="Volver al editor de lecciones">
          <ArrowLeft aria-hidden="true" /> Volver
        </Link>
        <div>
          <div className="building-kicker">Herramienta para docentes</div>
          <h1>Construcción de palabras</h1>
          <p>Elige objetivos aprobados y escribe tus propias frases.</p>
        </div>
      </header>

      <main className="building-editor-body">
        {loading ? (
          <section className="building-editor-card" aria-label="Cargando lecciones">
            <div className="building-skeleton" style={{ width: 230 }} />
            <div className="building-skeleton" style={{ height: 44 }} />
            <div className="building-skeleton" style={{ height: 150 }} />
          </section>
        ) : error && !lesson ? (
          <section className="building-editor-card">
            <h2 className="building-card-title">No pudimos cargar las lecciones</h2>
            <p className="building-card-help" role="alert">{readableError(error)}</p>
          </section>
        ) : !lessons.length ? (
          <section className="building-editor-card">
            <h2 className="building-card-title">Todavía no hay lecciones</h2>
            <p className="building-card-help">Crea una lección en el editor para configurar su práctica.</p>
            <Link to="/LessonEditor" className="building-link" data-testid="link-create-lesson"><ArrowLeft aria-hidden="true" /> Abrir el editor de lecciones</Link>
          </section>
        ) : (
          <>
            <section className="building-editor-card">
              <label htmlFor="building-lesson" className="building-form-label">Lección</label>
              <select
                id="building-lesson"
                data-testid="select-building-lesson"
                className="building-select"
                value={lessonId}
                onChange={(event) => changeLesson(event.target.value)}
              >
                {lessons.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.lesson_number ? `${entry.lesson_number}. ` : ''}{entry.title}{entry.class_name ? ` · ${entry.class_name}` : ''}
                  </option>
                ))}
              </select>
              <p className="building-card-help" style={{ marginTop: 9 }}>
                Las fichas se limitan al banco curricular disponible para esta lección. Los objetivos que todavía no corresponden no se agregarán.
              </p>
              {studentId && (
                <div className="building-availability" aria-label="Enlaces de práctica">
                  {practiceKinds.map(([kind, label]) => (
                    <Link
                      key={kind}
                      to={`/BuildingPractice?lessonId=${encodeURIComponent(lessonId)}&studentId=${encodeURIComponent(studentId)}&kind=${encodeURIComponent(kind)}`}
                      className="building-chip"
                      data-testid={`link-practice-${kind}`}
                    >
                      {label} <ExternalLink aria-hidden="true" style={{ width: 14, height: 14, marginLeft: 5 }} />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="building-editor-card">
              <h2 className="building-card-title">Objetivos de la ronda</h2>
              <p className="building-card-help">Deja una lista vacía para usar automáticamente el banco curricular revisado. Las listas que escribas se filtran contra ese mismo banco.</p>
              <div className="building-editor-grid">
                {LIST_TYPES.map(({ key, title, help }) => (
                  <div className="building-list-box" key={key}>
                    <h3>{title}</h3>
                    <p>{help}</p>
                    <label className="building-form-label" htmlFor={`list-${key}`}>Anulaciones opcionales · una por línea</label>
                    <textarea
                      id={`list-${key}`}
                      data-testid={`textarea-${key}`}
                      className="building-textarea"
                      value={draft[key]}
                      onChange={(event) => updateList(key, event.target.value)}
                      placeholder="Deja vacío para usar los objetivos automáticos"
                    />
                    <div className="building-save-state">{normalizeList(draft[key]).length ? `${normalizeList(draft[key]).length} objetivos escritos` : 'Banco automático activo'}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="building-editor-card">
              <div className="building-savebar">
                <div>
                  <h2 className="building-card-title">Frases con imagen</h2>
                  <p className="building-card-help" style={{ marginBottom: 0 }}>Cada frase debe ser escrita por ti y acompañarse de una imagen de sustantivo verificada.</p>
                </div>
                <button type="button" data-testid="button-add-building-phrase" className="building-button building-button--soft" onClick={addPhrase}>
                  <Plus aria-hidden="true" /> Añadir frase
                </button>
              </div>

              {draft.phrases.length === 0 && (
                <div className="building-notice">Aún no hay frases personalizadas. El banco curricular automático seguirá disponible.</div>
              )}

              {draft.phrases.map((phrase, index) => (
                <div className="building-phrase-row" key={phrase.editorKey || index} data-testid={`row-building-phrase-${index}`}>
                  <div>
                    <label className="building-form-label" htmlFor={`phrase-text-${index}`}>Frase escrita por la maestra</label>
                    <input
                      id={`phrase-text-${index}`}
                      data-testid={`input-phrase-text-${index}`}
                      className="building-input"
                      value={phrase.text}
                      onChange={(event) => updatePhrase(index, { text: event.target.value })}
                      placeholder="Escribe aquí la frase completa"
                    />
                    <label className="building-form-label" htmlFor={`noun-search-${index}`}>Busca el sustantivo de la imagen</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id={`noun-search-${index}`}
                        data-testid={`input-noun-search-${index}`}
                        className="building-input"
                        value={phrase.searchWord}
                        onChange={(event) => updatePhrase(index, { searchWord: event.target.value })}
                        placeholder="Ej.: gato"
                      />
                      <button type="button" data-testid={`button-search-noun-image-${index}`} className="building-button building-button--soft" onClick={() => searchImage(index)} disabled={Boolean(searchState[index]?.loading)} aria-label="Buscar imagen del sustantivo">
                        {searchState[index]?.loading ? <LoaderCircle className="building-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                      </button>
                    </div>
                    {searchState[index]?.error && <p className="building-save-state is-error" role="alert">{searchState[index].error}</p>}
                    {phraseErrors[index] && <p className="building-save-state is-error" role="alert">{phraseErrors[index]}</p>}
                  </div>
                  <div>
                    <label className="building-form-label" htmlFor={`phrase-image-${index}`}>URL segura de la imagen</label>
                    <input
                      id={`phrase-image-${index}`}
                      data-testid={`input-phrase-image-${index}`}
                      className="building-input"
                      type="url"
                      value={phrase.imageUrl}
                      onChange={(event) => updatePhrase(index, { imageUrl: event.target.value })}
                      placeholder="https://…"
                    />
                    <div className="building-image-preview" data-testid={`preview-phrase-image-${index}`}>
                      {phrase.imageUrl && /^https:\/\//i.test(phrase.imageUrl)
                        ? <img src={phrase.imageUrl} alt={`Vista previa de la imagen de la frase ${index + 1}`} />
                        : <ImageIcon aria-hidden="true" style={{ width: 32, height: 32 }} />}
                      <span>{phrase.imageUrl ? 'Vista previa de imagen' : 'La imagen aparecerá aquí'}</span>
                    </div>
                  </div>
                  <button type="button" data-testid={`button-remove-phrase-${index}`} className="building-button building-button--soft" onClick={() => removePhrase(index)} aria-label={`Eliminar frase ${index + 1}`}>
                    <Trash2 aria-hidden="true" /> Quitar
                  </button>
                </div>
              ))}
            </section>

            <section className="building-editor-card">
              <h2 className="building-card-title">Objetivos disponibles ahora</h2>
              <p className="building-card-help">Estos son los objetivos que el banco curricular tiene disponibles en la posición seleccionada. Objetivos futuros no aparecen aquí.</p>
              <div className="building-editor-grid">
                {['sight_words', 'syllables', 'words', 'phrases'].map((key) => {
                  const available = currentPools[key].map(targetText).filter(Boolean);
                  return (
                    <div key={key}>
                      <div className="building-kicker">{key === 'sight_words' ? 'Palabras frecuentes' : key === 'syllables' ? 'Sílabas' : key === 'words' ? 'Palabras' : 'Frases del banco'}</div>
                      <div className="building-availability" data-testid={`targets-available-${key}`}>
                        {available.length
                          ? available.map((value, index) => <span className="building-chip" key={`${value}-${index}`}>{value}</span>)
                          : <span className="building-save-state">No hay objetivos disponibles en esta posición.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="building-editor-card building-savebar">
              <div>
                <div className={`building-save-state${saveError ? ' is-error' : ''}`} role={saveError ? 'alert' : 'status'} data-testid="status-building-save">
                  {busy ? 'Guardando cambios…' : saveError || (saved ? 'Cambios guardados.' : dirty ? 'Tienes cambios sin guardar.' : 'Configuración guardada.')}
                </div>
                {error && <div className="building-save-state is-error" role="alert">{readableError(error)}</div>}
              </div>
              <button type="button" data-testid="button-save-building-setup" className="building-button building-button--primary" onClick={handleSave} disabled={busy || !dirty}>
                {busy ? <LoaderCircle className="building-spin" aria-hidden="true" /> : null}
                {busy ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
