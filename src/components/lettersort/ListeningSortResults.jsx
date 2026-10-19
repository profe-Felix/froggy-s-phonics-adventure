import { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function ListeningSortResults() {
  const [className, setClassName] = useState(() => new URLSearchParams(window.location.search).get('class') || '');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!className.trim() || busy) return;
    setBusy(true); setError('');
    try { setRows(await base44.entities.LetterSortResult.filter({ class_name: className.trim() }, '-submitted_at', 100)); }
    catch { setError('No se pudieron cargar los resultados. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }
  return <details className="m-3 rounded-lg border bg-white p-3" data-testid="listening-results">
    <summary className="font-bold cursor-pointer">Resultados por estudiante — actividades de escucha</summary>
    <p className="text-sm my-2">Cada intento incorrecto cuenta, aunque después lo corrijan. “Primera vez” cuenta las respuestas sin errores previos.</p>
    <div className="flex gap-2 my-2">
      <input aria-label="Clase para resultados" placeholder="Clase" value={className} onChange={e => setClassName(e.target.value)} className="border rounded px-2 py-2" />
      <button onClick={load} disabled={busy || !className.trim()} className="bg-indigo-600 text-white rounded px-3 disabled:opacity-50">{busy ? 'Cargando…' : 'Ver / actualizar'}</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="overflow-auto"><table className="text-sm w-full text-left">
      <thead><tr>{['Estudiante', 'Actividad / sonidos', 'Correctas', 'Incorrectas', 'Primera vez', 'Estado', 'Detalle'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-t">
        <td className="p-2">#{row.student_number}</td><td className="p-2">{row.mode} · {row.targets}</td>
        <td className="p-2">{row.correct}</td><td className="p-2 text-red-700">{row.wrong}</td>
        <td className="p-2">{row.first_try_correct}</td><td className="p-2">{row.completed ? 'Completo' : 'En progreso'}</td>
        <td className="p-2"><AttemptDetails value={row.attempts_data} /></td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="text-sm text-slate-500">Elige una clase y carga sus intentos guardados. Las vistas de prueba del maestro no se registran como estudiante.</p>}
  </details>;
}
function AttemptDetails({ value }) {
  let attempts = [];
  try { attempts = JSON.parse(value || '[]'); } catch {}
  return <details><summary className="cursor-pointer">Ver intentos ({attempts.length})</summary>
    <ol className="max-h-64 overflow-auto">{attempts.map((a, i) => <li key={i} className="whitespace-nowrap">
      {i + 1}. /{a.target}/ · {a.word} → {a.correct ? 'correcto' : 'incorrecto'} {a.row ? `(${a.row})` : ''}
    </li>)}</ol>
  </details>;
}
