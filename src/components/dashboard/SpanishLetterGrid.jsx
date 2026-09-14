import React from 'react';
import { ES_PERIODS, PERIODS } from '@/lib/dashboardData';
import { CheckCell } from './CheckCell';

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

function ParentInitialsRow({ data, toggle, path, readOnly }) {
  return (
    <div className="border-t-2 border-black p-2">
      <p className="text-xs font-bold mb-1">Iniciales de los padres</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PERIODS.map(p => (
          <div key={p} className="border-2 border-black rounded px-2 py-1 text-xs">
            <span className="font-bold">{p} 9 Weeks:</span>
            <input
              type="text"
              value={data?.[p] || ''}
              onChange={(e) => toggle(`${path}.${p}`, e.target.value, true)}
              readOnly={readOnly}
              className="w-full border-b border-gray-400 outline-none bg-transparent mt-0.5"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpanishLetterGrid({ data, toggle, readOnly }) {
  return (
    <div className="border-2 border-black">
      <SectionHeader title="Identificación de letras y sonidos" />
      {ES_PERIODS.map((period, pi) => {
        const periodKey = PERIODS[pi];
        return (
          <div key={pi} className="border-b-2 border-black last:border-b-0">
            {/* Period header: label, editable end date, modules, last letter learned */}
            <div className="flex flex-wrap items-center gap-2 px-2 py-1 bg-gray-100 border-b border-black text-xs font-bold">
              <span>{period.label}:</span>
              <span>Terminan</span>
              <input
                type="text"
                value={data.periodDates?.[periodKey] ?? period.defaultDate}
                onChange={(e) => toggle(`periodDates.${periodKey}`, e.target.value, true)}
                readOnly={readOnly}
                className="w-20 border-b border-gray-400 outline-none bg-transparent"
              />
              <span className="ml-auto">{period.modules}</span>
              <span>Última letra:</span>
              <input
                type="text"
                value={data.lastLetterLearned?.[periodKey] ?? ''}
                onChange={(e) => toggle(`lastLetterLearned.${periodKey}`, e.target.value, true)}
                readOnly={readOnly}
                className="w-12 border-b border-gray-400 outline-none bg-transparent"
                placeholder="—"
              />
            </div>
            {/* Letter table */}
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16"></td>
                  {period.letters.map((l, ci) => (
                    <td key={`${l.k}-${ci}`} className="border-2 border-black text-center px-1 min-w-[1.6rem]"
                      style={cellBorderStyle(period.letters, ci)}>
                      <div className="font-bold text-sm leading-tight">{l.d}</div>
                      {l.p && <div className="text-[10px] font-normal text-gray-600 leading-tight">{l.p}</div>}
                    </td>
                  ))}
                </tr>
                {SKILL_ROWS.map(sr => (
                  <tr key={`${pi}-${sr.key}`}>
                    <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16">{sr.label}</td>
                    {period.letters.map((l, ci) => (
                      <td key={`${l.k}-${ci}-${sr.key}`} className="border-2 border-black p-0"
                        style={cellBorderStyle(period.letters, ci)}>
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
      {/* Compact summary line */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-1.5 border-t-2 border-black text-xs">
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} /> Conoce todas las mayúsculas
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} /> Conoce todas las minúsculas
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} /> Conoce todos los sonidos
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allFormation} onClick={() => toggle('allFormation')} readOnly={readOnly} /> Forma todas las letras correctamente
        </label>
      </div>
      <ParentInitialsRow data={data.parentInitials?.letters} toggle={toggle} path="parentInitials.letters" readOnly={readOnly} />
    </div>
  );
}

export default SpanishLetterGrid;