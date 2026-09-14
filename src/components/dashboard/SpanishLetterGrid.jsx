import React from 'react';
import { ES_PERIODS, PERIODS } from '@/lib/dashboardData';
import { CheckCell, InlineToggle } from './CheckCell';

function SectionHeader({ title }) {
  return (
    <div className="bg-[#FF0000] text-white font-bold uppercase text-sm text-center py-1.5 border-2 border-black">
      {title}
    </div>
  );
}

function cellBorderStyle(letters, ci) {
  const style = {};
  if (letters[ci].tl) style.borderLeftWidth = '1px';
  if (ci < letters.length - 1 && letters[ci + 1].tl) style.borderRightWidth = '1px';
  return style;
}

const SKILL_ROWS = [
  { label: 'Letra', key: 'upper' },
  { label: 'Sonidos', key: 'sound' },
  { label: 'Formación', key: 'formation' },
];

// Inline initials box — label and input on the SAME line inside a bordered box.
function InlineInitialsBox({ period, value, onChange, readOnly }) {
  return (
    <div className="border-2 border-black px-2 py-1 text-xs flex items-center gap-1">
      <span className="font-bold whitespace-nowrap">{period} 9 Weeks:</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="flex-1 border-b border-black outline-none bg-transparent min-w-0"
      />
    </div>
  );
}

export function SpanishLetterGrid({ data, toggle, readOnly }) {
  return (
    <div className="border-2 border-black">
      <SectionHeader title="Identificación de letras y sonidos" />
      {ES_PERIODS.map((period, pi) => {
        const periodKey = PERIODS[pi];
        const allLetters = period.modules.flatMap(m => m.letters);
        return (
          <div key={pi} className="border-b-2 border-black last:border-b-0">
            {/* Period header: label + editable end date only (última letra is in settings) */}
            <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 border-b border-black text-xs font-bold">
              <span>{period.label}:</span>
              <span>Terminan</span>
              <input
                type="text"
                value={data.periodDates?.[periodKey] ?? period.defaultDate}
                onChange={(e) => toggle(`periodDates.${periodKey}`, e.target.value, true)}
                readOnly={readOnly}
                className="w-20 border-b border-gray-400 outline-none bg-transparent"
              />
            </div>
            {/* Letter table with module overarch headers */}
            <table className="w-full border-collapse">
              <tbody>
                {/* Module header row — each module name spans its letter columns */}
                <tr>
                  <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16"></td>
                  {period.modules.map((m, mi) => (
                    <td key={mi} colSpan={m.letters.length} className="border-2 border-black text-center font-bold text-xs py-1 bg-gray-50">
                      {m.name}
                    </td>
                  ))}
                </tr>
                {/* Letter row */}
                <tr>
                  <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16"></td>
                  {allLetters.map((l, ci) => (
                    <td key={`${l.k}-${ci}`} className="border-2 border-black text-center px-1 min-w-[1.6rem]"
                      style={cellBorderStyle(allLetters, ci)}>
                      <div className="font-bold text-sm leading-tight">{l.d}</div>
                      {l.p && <div className="text-[10px] font-normal text-gray-600 leading-tight">{l.p}</div>}
                    </td>
                  ))}
                </tr>
                {/* Skill rows */}
                {SKILL_ROWS.map(sr => (
                  <tr key={`${pi}-${sr.key}`}>
                    <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16">{sr.label}</td>
                    {allLetters.map((l, ci) => (
                      <td key={`${l.k}-${ci}-${sr.key}`} className="border-2 border-black p-0"
                        style={cellBorderStyle(allLetters, ci)}>
                        <CheckCell
                          checked={data.letters[l.k]?.[sr.key]}
                          onClick={() => toggle(`letters.${l.k}.${sr.key}`)}
                          readOnly={readOnly}
                          blackedOut={sr.key === 'upper' && l.bl}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {/* Single-line summary with inline toggle underlines */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t-2 border-black">
        <InlineToggle label="Conoce todas las mayúsculas" checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} />
        <InlineToggle label="Conoce todas las minúsculas" checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} />
        <InlineToggle label="Conoce todos los sonidos" checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} />
        <InlineToggle label="Forma todas las letras correctamente" checked={data.allFormation} onClick={() => toggle('allFormation')} readOnly={readOnly} />
      </div>
      {/* Parent initials — inline boxes on a single row */}
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">Iniciales de los padres</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <InlineInitialsBox
              key={p}
              period={p}
              value={data.parentInitials?.letters?.[p]}
              onChange={(v) => toggle(`parentInitials.letters.${p}`, v, true)}
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default SpanishLetterGrid;