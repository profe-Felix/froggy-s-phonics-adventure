import React from 'react';
import {
  ES_PERIOD_INFO,
  computePeriods,
  computeSightWordPeriods,
  groupByModule,
  PERIODS,
} from '@/lib/dashboardData';
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

  if (letters[ci].tl) {
    style.borderLeftWidth = '1px';
  }

  if (
    ci < letters.length - 1 &&
    letters[ci + 1].tl
  ) {
    style.borderRightWidth = '1px';
  }

  return style;
}

const SKILL_ROWS = [
  { label: 'Letra', key: 'upper' },
  { label: 'Sonidos', key: 'sound' },
  { label: 'Formación', key: 'formation' },
];

function InlineInitialsBox({
  period,
  value,
  onChange,
  readOnly,
}) {
  return (
    <div className="border-2 border-black px-2 py-1 text-xs flex items-center gap-1">
      <span className="font-bold whitespace-nowrap">
        {period} 9 Weeks:
      </span>

      <input
        type="text"
        value={value || ''}
        onChange={(event) =>
          onChange(event.target.value)
        }
        readOnly={readOnly}
        className="flex-1 border-b border-black outline-none bg-transparent min-w-0"
      />
    </div>
  );
}

function groupSightWordsByModule(words) {
  const groups = [];

  for (const item of words) {
    const previousGroup =
      groups[groups.length - 1];

    if (
      previousGroup &&
      previousGroup.module_number ===
        item.module_number
    ) {
      previousGroup.words.push(item);
    } else {
      groups.push({
        module_number: item.module_number,
        words: [item],
      });
    }
  }

  return groups;
}

function SightWordSection({
  words,
  data,
  toggle,
  readOnly,
}) {
  if (!words.length) {
    return null;
  }

  const moduleGroups =
    groupSightWordsByModule(words);

  return (
    <div className="border-t-2 border-black">
      <div className="grid grid-cols-[8rem_1fr]">
        <div className="border-r-2 border-black bg-gray-50 px-2 py-2 text-xs font-bold">
          <div>Palabras frecuentes</div>
          <div className="mt-1 text-[9px] font-normal text-gray-600">
            L = Lee · E = Escribe
          </div>
        </div>

        <div className="divide-y divide-black">
          {moduleGroups.map((group) => (
            <div
              key={group.module_number}
              className="grid grid-cols-[5rem_1fr]"
            >
              <div className="border-r border-black bg-gray-50 px-2 py-2 text-center text-xs font-bold">
                Módulo {group.module_number}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 px-3 py-2">
                {group.words.map((item) => {
                  const mastery =
                    data.sightWords?.[item.word];

                  const canRead =
                    mastery === true ||
                    mastery?.read === true;

                  const canWrite =
                    mastery?.write === true;

                  return (
                    <div
                      key={item.key}
                      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-0.5"
                    >
                      <span className="mr-0.5 text-sm font-semibold">
                        {item.word}
                      </span>

                      <label className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-600">
                        L
                        <input
                          type="checkbox"
                          checked={canRead}
                          onChange={() =>
                            toggle(
                              `sightWords.${item.word}.read`
                            )
                          }
                          disabled={readOnly}
                          aria-label={`Lee ${item.word}`}
                          className="h-3.5 w-3.5 accent-green-600 disabled:opacity-100"
                        />
                      </label>

                      <label className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-600">
                        E
                        <input
                          type="checkbox"
                          checked={canWrite}
                          onChange={() =>
                            toggle(
                              `sightWords.${item.word}.write`
                            )
                          }
                          disabled={readOnly}
                          aria-label={`Escribe ${item.word}`}
                          className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-100"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpanishLetterGrid({
  data,
  toggle,
  readOnly,
}) {
  const periods = computePeriods(
    data.lastLetterLearned
  );

  const sightWordPeriods =
    computeSightWordPeriods(
      data.lastSightWordLearned
    );

  return (
    <div className="border-2 border-black">
      <SectionHeader title="Identificación de letras y sonidos" />

      {periods.map((periodLetters, pi) => {
        const info = ES_PERIOD_INFO[pi];
        const periodKey = PERIODS[pi];
        const modules =
          groupByModule(periodLetters);
        const allLetters = periodLetters;
        const periodSightWords =
          sightWordPeriods[pi] || [];

        return (
          <div
            key={pi}
            className="border-b-2 border-black last:border-b-0"
          >
            <div className="flex items-center gap-2 px-2 py-0.5 bg-gray-100 border-b border-black text-xs font-bold">
              <span>{info.label}:</span>
              <span>Terminan</span>

              <input
                type="text"
                value={
                  data.periodDates?.[
                    periodKey
                  ] ?? info.defaultDate
                }
                onChange={(event) =>
                  toggle(
                    `periodDates.${periodKey}`,
                    event.target.value,
                    true
                  )
                }
                readOnly={readOnly}
                className="w-20 border-b border-gray-400 outline-none bg-transparent"
              />
            </div>

            {allLetters.length > 0 && (
              <table className="w-full border-collapse table-fixed">
                <tbody>
                  <tr>
                    <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-20" />

                    {modules.map((module, mi) => (
                      <td
                        key={mi}
                        colSpan={
                          module.letters.length
                        }
                        className="border-2 border-black text-center font-bold text-xs py-0.5 bg-gray-50"
                      >
                        {module.name}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-20" />

                    {allLetters.map(
                      (letter, ci) => (
                        <td
                          key={`${letter.k}-${ci}`}
                          className="border-2 border-black text-center px-0"
                          style={{
                            ...cellBorderStyle(
                              allLetters,
                              ci
                            ),
                          }}
                        >
                          <div className="font-bold text-sm leading-tight whitespace-nowrap">
                            {letter.d}

                            {letter.p && (
                              <span className="text-[10px] font-normal text-gray-600 ml-0.5">
                                {letter.p}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    )}
                  </tr>

                  {SKILL_ROWS.map(
                    (skillRow) => (
                      <tr
                        key={`${pi}-${skillRow.key}`}
                      >
                        <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-20">
                          {skillRow.label}
                        </td>

                        {allLetters.map(
                          (letter, ci) => (
                            <td
                              key={`${letter.k}-${ci}-${skillRow.key}`}
                              className="border-2 border-black p-0"
                              style={cellBorderStyle(
                                allLetters,
                                ci
                              )}
                            >
                              <CheckCell
                                checked={
                                  data.letters?.[
                                    letter.k
                                  ]?.[
                                    skillRow.key
                                  ]
                                }
                                onClick={() =>
                                  toggle(
                                    `letters.${letter.k}.${skillRow.key}`
                                  )
                                }
                                readOnly={
                                  readOnly
                                }
                                blackedOut={
                                  skillRow.key ===
                                    'upper' &&
                                  letter.bl
                                }
                              />
                            </td>
                          )
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}

            <SightWordSection
              words={periodSightWords}
              data={data}
              toggle={toggle}
              readOnly={readOnly}
            />
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t-2 border-black">
        <InlineToggle
          label="Conoce todas las mayúsculas"
          checked={data.allUpper}
          onClick={() => toggle('allUpper')}
          readOnly={readOnly}
        />

        <InlineToggle
          label="Conoce todas las minúsculas"
          checked={data.allLower}
          onClick={() => toggle('allLower')}
          readOnly={readOnly}
        />

        <InlineToggle
          label="Conoce todos los sonidos"
          checked={data.allSounds}
          onClick={() => toggle('allSounds')}
          readOnly={readOnly}
        />

        <InlineToggle
          label="Forma todas las letras correctamente"
          checked={data.allFormation}
          onClick={() =>
            toggle('allFormation')
          }
          readOnly={readOnly}
        />
      </div>

      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">
          Iniciales de los padres
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map((period) => (
            <InlineInitialsBox
              key={period}
              period={period}
              value={
                data.parentInitials
                  ?.letters?.[period]
              }
              onChange={(value) =>
                toggle(
                  `parentInitials.letters.${period}`,
                  value,
                  true
                )
              }
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default SpanishLetterGrid;