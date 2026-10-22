import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleHelp,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { useBuildingRound } from '@/hooks/useBuildingPractice';
import './building-practice.css';

function speak(text) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-MX';
  window.speechSynthesis.speak(utterance);
  return true;
}

function readableError(value) {
  if (typeof value === 'string') return value;
  return value?.message || 'Ocurrió un error. Vuelve a intentarlo.';
}

export default function BuildingMasteryActivity({
  studentData,
  studentNumber,
  className,
  lessonId,
  kind,
  onComplete,
}) {
  const {
    loading,
    busy,
    error,
    item,
    round,
    feedback,
    mastered,
    submit,
    requestHint,
    advance,
    startRound,
    reload,
  } = useBuildingRound({ studentData, studentNumber, className, lessonId, kind });
  const [selected, setSelected] = useState([]);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [localError, setLocalError] = useState('');
  const [speakingError, setSpeakingError] = useState(false);

  useEffect(() => {
    setSelected([]);
    setHintRevealed(false);
    setLocalError('');
  }, [item?.index, item?.audioText, round?.id]);

  useEffect(() => {
    const handleKeys = (event) => {
      const target = event.target;
      if (target?.closest?.('button, input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Backspace') {
        event.preventDefault();
        setSelected((current) => current.slice(0, -1));
      } else if (event.key === 'Escape') {
        setSelected([]);
      } else if (event.key === 'Enter' && selected.length && !busy && !feedback?.correct) {
        event.preventDefault();
        handleCheck();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [selected, busy, feedback?.correct]);

  const selectedIds = useMemo(() => new Set(selected.map((tile) => tile.id)), [selected]);
  const targetType = item?.unit === 'letter' ? 'letra' : item?.unit === 'syllable' ? 'sílaba' : 'palabra';
  const answered = Math.min(round?.answered || 0, round?.total || 20);
  const roundFinished = Boolean(round?.passed || round?.needsPractice);
  const showMastered = Boolean(mastered && !round);

  async function handleCheck() {
    if (!selected.length || busy || feedback?.correct) return;
    setLocalError('');
    try {
      await submit(selected.map((tile) => tile.id));
    } catch {
      setLocalError('No pudimos enviar la respuesta. Tus fichas siguen aquí; inténtalo de nuevo.');
    }
  }

  async function handleHint() {
    if (busy || hintRevealed) return;
    setLocalError('');
    try {
      const result = await requestHint();
      if (result?.feedback?.hintText) setHintRevealed(true);
    } catch {
      setLocalError('La pista no está disponible ahora. Puedes seguir escuchando.');
    }
  }

  function handleListen() {
    const ok = speak(item?.audioText);
    setSpeakingError(!ok);
  }

  function addTile(tile) {
    if (busy || feedback?.correct || selectedIds.has(tile.id)) return;
    setLocalError('');
    setSelected((current) => [...current, tile]);
  }

  function removeTile(tileId) {
    if (busy || feedback?.correct) return;
    setSelected((current) => current.filter((tile) => tile.id !== tileId));
    setLocalError('');
  }

  function moveTile(index, delta) {
    setSelected((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function handleAdvance() {
    setLocalError('');
    try {
      await advance();
    } catch {
      setLocalError('No pudimos cargar la siguiente ficha. Vuelve a intentarlo.');
    }
  }

  if (loading) {
    return (
      <div className="building-ui building-activity">
        <div className="building-shell">
          <div className="building-topbar">
            <div><div className="building-skeleton" style={{ width: 175 }} /><div className="building-skeleton" style={{ width: 245 }} /></div>
            <div className="building-skeleton" style={{ width: 90 }} />
          </div>
          <div className="building-panel" aria-label="Cargando actividad">
            <div className="building-skeleton" style={{ height: 190, maxWidth: 360, margin: '15px auto' }} />
            <div className="building-skeleton" style={{ height: 72, maxWidth: 600, margin: '15px auto' }} />
          </div>
        </div>
      </div>
    );
  }

  if (showMastered) {
    return (
      <div className="building-ui building-activity">
        <main className="building-shell">
          <section className="building-panel building-result">
            <div className="building-result-mark"><Check aria-hidden="true" /></div>
            <p className="building-kicker">Meta alcanzada</p>
            <h2>Ya dominas esta construcción</h2>
            <p>Puedes volver a practicar cuando quieras. Tu avance ya está guardado.</p>
            <div className="building-controls">
              <button type="button" data-testid="button-practice-again" className="building-button building-button--soft" onClick={() => startRound()}>
                <RotateCcw aria-hidden="true" /> Practicar otra vez
              </button>
              <button type="button" data-testid="button-continue-mastered" className="building-button building-button--primary" onClick={onComplete}>
                Continuar <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (roundFinished) {
    const passed = Boolean(round?.passed);
    const firstTry = round?.correctFirst ?? 0;
    return (
      <div className="building-ui building-activity">
        <main className="building-shell">
          <section className="building-panel building-result">
            <div className="building-result-mark">{passed ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}</div>
            <p className="building-kicker">{passed ? '¡Meta lograda!' : 'Una vuelta más'}</p>
            <h2>{passed ? 'Construiste con mucho cuidado' : 'Vamos a practicar un poco más'}</h2>
            <p>
              Necesitas <strong>18 de 20 correctas en el primer intento</strong> para pasar.
              {' '}{firstTry} de {round?.total || 20} fueron correctas al primer intento.
            </p>
            <div className="building-controls">
              {passed ? (
                <button type="button" data-testid="button-continue-passed" className="building-button building-button--primary" onClick={onComplete}>
                  Continuar <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button type="button" data-testid="button-start-another-round" className="building-button building-button--primary" onClick={() => startRound()}>
                    Practicar otra ronda <RotateCcw aria-hidden="true" />
                  </button>
                  {mastered && (
                    <button type="button" data-testid="button-continue-earned-mastery" className="building-button building-button--soft" onClick={onComplete}>
                      Continuar con meta guardada <ArrowRight aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </div>
            {(error || localError) && <div role="alert" className="building-notice">{localError || readableError(error)}</div>}
          </section>
        </main>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="building-ui building-activity">
        <main className="building-shell">
          <section className="building-panel building-result">
            <div className="building-result-mark"><ImageIcon aria-hidden="true" /></div>
            <h2>No hay fichas listas todavía</h2>
            <p>Tu maestra está preparando las palabras y las imágenes para esta actividad.</p>
            {(error || localError) && <div role="alert" className="building-notice">{localError || readableError(error)}</div>}
            <button type="button" data-testid="button-reload-building" className="building-button building-button--soft" onClick={() => reload()}>
              <RotateCcw aria-hidden="true" /> Volver a intentar
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="building-ui building-activity">
      <main className="building-shell">
        <header className="building-topbar">
          <div>
            <div className="building-kicker">Construye con fichas</div>
            <h1 className="building-heading">Escucha y arma la {targetType}</h1>
            <div className="building-progress" role="progressbar" aria-label="Progreso de la ronda" aria-valuemin="0" aria-valuemax={round?.total || 20} aria-valuenow={answered}>
              {Array.from({ length: round?.total || 20 }, (_, index) => (
                <span key={index} className={index < answered ? 'is-done' : index === answered ? 'is-current' : ''} />
              ))}
            </div>
          </div>
          <div className="building-count" data-testid="text-round-progress">{Math.min(answered + 1, round?.total || 20)} / {round?.total || 20}</div>
        </header>

        <section className="building-panel">
          <div className="building-workspace">
            <div className="building-prompt">
              {item.imageUrl ? (
                <button type="button" className="building-image-button" data-testid="button-image-listen" onClick={handleListen} aria-label="Escuchar la palabra de la imagen">
                  <img src={item.imageUrl} alt="Imagen de la palabra que vas a construir" />
                </button>
              ) : (
                <div className="building-image-placeholder" aria-hidden="true"><ImageIcon /></div>
              )}
              <h2 className="building-instruction">Toca para escuchar</h2>
              <p className="building-subtext">La palabra todavía no aparece. Escúchala con atención.</p>
              <div className="building-controls">
                <button type="button" data-testid="button-hear-target" className="building-button building-button--listen" onClick={handleListen}>
                  <Volume2 aria-hidden="true" /> Escuchar
                </button>
                <button type="button" data-testid="button-request-hint" className="building-button building-button--soft" onClick={handleHint} disabled={busy || hintRevealed}>
                  <CircleHelp aria-hidden="true" /> Pista
                </button>
              </div>
              {hintRevealed && (
                <div className="building-feedback" data-testid="text-revealed-hint">
                  Pista: <strong>{feedback?.hintText || item.hintText || item.audioText}</strong>
                </div>
              )}
              {speakingError && <p className="building-subtext" role="status">El audio no está disponible en este dispositivo.</p>}
            </div>

            <div>
              <div className={`building-selected${feedback?.correct ? ' is-correct' : feedback && !feedback.correct ? ' is-wrong' : ''}`} aria-label="Fichas elegidas">
                {selected.length ? selected.map((tile, index) => (
                  <button
                    key={`${tile.id}-${index}`}
                    type="button"
                    data-testid={`button-selected-tile-${index}`}
                    className="building-tile building-tile--selected"
                    aria-label={`Quitar ficha ${tile.value} de la posición ${index + 1}`}
                    onClick={() => removeTile(tile.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft') { event.preventDefault(); moveTile(index, -1); }
                      if (event.key === 'ArrowRight') { event.preventDefault(); moveTile(index, 1); }
                    }}
                    disabled={busy || feedback?.correct}
                  >{tile.value}</button>
                )) : <span className="building-selected-empty">Tus fichas aparecerán aquí</span>}
              </div>
              <div className="building-tile-grid" aria-label="Fichas disponibles">
                {(item.tiles || []).map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    data-testid={`button-tile-${tile.id}`}
                    className="building-tile building-tile--choice"
                    onClick={() => addTile(tile)}
                    disabled={busy || Boolean(feedback?.correct) || selectedIds.has(tile.id)}
                    aria-label={`Añadir ficha ${tile.value}`}
                  >{tile.value}</button>
                ))}
              </div>
              <div className="building-controls">
                <button type="button" data-testid="button-clear-selection" className="building-button building-button--soft" onClick={() => setSelected([])} disabled={!selected.length || busy || feedback?.correct}>
                  Borrar
                </button>
                <button type="button" data-testid="button-check-building" className="building-button building-button--primary" onClick={handleCheck} disabled={!selected.length || busy || feedback?.correct}>
                  {busy ? <LoaderCircle aria-hidden="true" className="building-spin" /> : <Check aria-hidden="true" />}
                  {busy ? 'Comprobando…' : 'Comprobar'}
                </button>
              </div>
            </div>
          </div>

          {(feedback || error || localError) && (
            <div role={localError || error || !feedback?.correct ? 'alert' : 'status'} className={`building-feedback${localError || error || (feedback && !feedback.correct) ? ' is-error' : ''}`} data-testid="status-building-feedback">
              {localError || (error ? readableError(error) : '') || feedback?.message || (feedback?.correct ? '¡Así es!' : 'Prueba otra vez.')}
              {feedback?.correct && (
                <button type="button" data-testid="button-advance-building" className="building-button building-button--primary" style={{ margin: '11px auto 0' }} onClick={handleAdvance} disabled={busy}>
                  Continuar <ArrowRight aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <p className="building-subtext" style={{ marginTop: 16, textAlign: 'center' }}>Consejo: puedes borrar una ficha o moverla con las flechas del teclado.</p>
        </section>
      </main>
    </div>
  );
}
