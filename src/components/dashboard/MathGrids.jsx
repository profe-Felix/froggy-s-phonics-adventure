import React from 'react';
import { EN_LETTERS_ROW1, EN_LETTERS_ROW2, NUMBERS_ROW1, NUMBERS_ROW2, COMPOSE_ROW1, COMPOSE_ROW2, PERIODS } from '@/lib/dashboardData';
import { CheckCell } from './CheckCell';

export function SectionHeader({ title }) {
  return (
    <div className="bg-[#FF0000] text-white font-bold uppercase text-sm text-center py-1.5 border-2 border-black">
      {title}
    </div>
  );
}

export function ParentInitialsRow({ label, data, toggle, path, readOnly }) {
  return (
    <div className="border-t-2 border-black p-2">
      <p className="text-xs font-bold mb-1">{label}</p>
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

export function EnglishLetterGrid({ data, toggle, readOnly }) {
  const rows = [
    { label: 'Upper Case', key: 'upper' },
    { label: 'Lower Case', key: 'lower' },
    { label: 'Sounds', key: 'sound' },
    { label: 'Formation', key: 'formation' },
  ];
  const allLetters = [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2];

  return (
    <div className="border-2 border-black">
      <SectionHeader title="Letter and Sound Identification" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20"></td>
              {allLetters.map(l => (
                <td key={l} className="border-2 border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{l}</td>
              ))}
            </tr>
            {rows.map(row => (
              <tr key={row.key}>
                <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{row.label}</td>
                {allLetters.map(l => (
                  <td key={`${l}-${row.key}`} className="border-2 border-black p-0">
                    <CheckCell checked={data.letters[l]?.[row.key]} onClick={() => toggle(`letters.${l}.${row.key}`)} readOnly={readOnly} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 px-3 py-1.5 border-t-2 border-black text-xs">
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} /> Knows all upper case
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} /> Knows all lower case
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} /> Knows all sounds
        </label>
        <label className="flex items-center gap-1.5 font-bold">
          <CheckCell checked={data.allFormation} onClick={() => toggle('allFormation')} readOnly={readOnly} /> Forms all letters correctly
        </label>
      </div>
      <ParentInitialsRow label="Parent Initials each 9 weeks" data={data.parentInitials?.letters} toggle={toggle} path="parentInitials.letters" readOnly={readOnly} />
    </div>
  );
}

export function NumbersGrid({ data, toggle, readOnly, lang }) {
  const title = lang === 'es' ? 'Número 0-20' : 'Numbers 0-20';
  const readLabel = lang === 'es' ? 'Leer' : 'Read';
  const writeLabel = lang === 'es' ? 'Escribir' : 'Write';
  const initialsLabel = lang === 'es' ? 'Iniciales de los padres' : 'Parent Initials';
  const canLabel = lang === 'es' ? 'Puedo' : 'I can';

  return (
    <div className="border-2 border-black">
      <SectionHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{canLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={n} className="border-2 border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{readLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-r`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{writeLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-w`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.write} onClick={() => toggle(`numbers.${n}.write`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20"></td>
              {NUMBERS_ROW2.map(n => (
                <td key={n} className="border-2 border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{readLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-r`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-2 py-1 text-xs font-bold w-20">{writeLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-w`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.write} onClick={() => toggle(`numbers.${n}.write`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ParentInitialsRow label={initialsLabel} data={data.parentInitials?.numbers} toggle={toggle} path="parentInitials.numbers" readOnly={readOnly} />
    </div>
  );
}

export function ComposeGrid({ data, toggle, readOnly, lang }) {
  const title = lang === 'es' ? 'Componer y descomponer números 0-20' : 'Compose and Decompose Numbers 0-20';
  const canLabel = lang === 'es' ? 'Puedo' : 'I can';
  const composeLabel = lang === 'es' ? 'Componer y representar' : 'Compose and represent';
  const decomp2Label = lang === 'es' ? 'Descomponer en 2 grupos' : 'Decompose into 2 groups';
  const decomp3Label = lang === 'es' ? 'Descomponer en 3 grupos' : 'Decompose into 3 groups';
  const countingLabel = lang === 'es' ? 'Puedo contar desde 0 hasta' : 'I can count starting from 0 to';
  const initialsLabel = lang === 'es' ? 'Iniciales de los padres' : 'Parent Initials';

  const renderBlock = (nums) => (
    <>
      <tr>
        <td className="border-2 border-black px-2 py-1 text-xs font-bold w-24">{canLabel}</td>
        {nums.map(n => (
          <td key={n} className="border-2 border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-2 py-1 text-xs w-24">{composeLabel}</td>
        {nums.map(n => (
          <td key={`${n}-c`} className="border-2 border-black p-0">
            <CheckCell checked={data.compose[n]?.compose} onClick={() => toggle(`compose.${n}.compose`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-2 py-1 text-xs w-24">{decomp2Label}</td>
        {nums.map(n => (
          <td key={`${n}-d2`} className="border-2 border-black p-0">
            <CheckCell checked={data.compose[n]?.decompose2} onClick={() => toggle(`compose.${n}.decompose2`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-2 py-1 text-xs w-24">{decomp3Label}</td>
        {nums.map(n => (
          <td key={`${n}-d3`} className="border-2 border-black p-0">
            <CheckCell checked={data.compose[n]?.decompose3} onClick={() => toggle(`compose.${n}.decompose3`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
    </>
  );

  return (
    <div className="border-2 border-black">
      <SectionHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {renderBlock(COMPOSE_ROW1)}
            {renderBlock(COMPOSE_ROW2)}
          </tbody>
        </table>
      </div>
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">{countingLabel}____</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <div key={p} className="border-2 border-black rounded px-2 py-1 text-xs">
              <span className="font-bold">{p} 9 Weeks:</span>
              <input
                type="text"
                value={data.counting?.[p] || ''}
                onChange={(e) => toggle(`counting.${p}`, e.target.value, true)}
                readOnly={readOnly}
                className="w-full border-b border-gray-400 outline-none bg-transparent mt-0.5"
              />
            </div>
          ))}
        </div>
      </div>
      <ParentInitialsRow label={initialsLabel} data={data.parentInitials?.compose} toggle={toggle} path="parentInitials.compose" readOnly={readOnly} />
    </div>
  );
}