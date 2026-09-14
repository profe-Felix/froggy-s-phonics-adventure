import React from 'react';
import { EN_LETTERS_ROW1, EN_LETTERS_ROW2, NUMBERS_ROW1, NUMBERS_ROW2, COMPOSE_ROW1, COMPOSE_ROW2, PERIODS } from '@/lib/dashboardData';
import { CheckCell, InlineToggle } from './CheckCell';

export function SectionHeader({ title }) {
  return (
    <div className="bg-[#FF0000] text-white font-bold uppercase text-sm text-center py-1.5 border-2 border-black">
      {title}
    </div>
  );
}

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

// Inline counting box — "0 - ____" format on the same line as the label.
function InlineCountingBox({ period, value, onChange, readOnly }) {
  return (
    <div className="border-2 border-black px-2 py-1 text-xs flex items-center gap-1">
      <span className="font-bold whitespace-nowrap">{period} 9 Weeks:</span>
      <span className="font-bold">0 -</span>
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
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16"></td>
              {allLetters.map(l => (
                <td key={l} className="border-2 border-black text-center font-bold text-sm px-0.5" style={{minWidth: '1.4rem'}}>{l}</td>
              ))}
            </tr>
            {rows.map(row => (
              <tr key={row.key}>
                <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{row.label}</td>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t-2 border-black">
        <InlineToggle label="Knows all upper case" checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} />
        <InlineToggle label="Knows all lower case" checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} />
        <InlineToggle label="Knows all sounds" checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} />
        <InlineToggle label="Forms all letters correctly" checked={data.allFormation} onClick={() => toggle('allFormation')} readOnly={readOnly} />
      </div>
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">Parent Initials each 9 weeks</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <InlineInitialsBox key={p} period={p} value={data.parentInitials?.letters?.[p]} onChange={(v) => toggle(`parentInitials.letters.${p}`, v, true)} readOnly={readOnly} />
          ))}
        </div>
      </div>
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
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{canLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={n} className="border-2 border-black text-center font-bold text-sm px-0.5" style={{minWidth: '1.4rem'}}>{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{readLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-r`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{writeLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-w`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.write} onClick={() => toggle(`numbers.${n}.write`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16"></td>
              {NUMBERS_ROW2.map(n => (
                <td key={n} className="border-2 border-black text-center font-bold text-sm px-0.5" style={{minWidth: '1.4rem'}}>{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{readLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-r`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-2 border-black px-1 py-0.5 text-xs font-bold w-16">{writeLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-w`} className="border-2 border-black p-0">
                  <CheckCell checked={data.numbers[n]?.write} onClick={() => toggle(`numbers.${n}.write`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">{initialsLabel}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <InlineInitialsBox key={p} period={p} value={data.parentInitials?.numbers?.[p]} onChange={(v) => toggle(`parentInitials.numbers.${p}`, v, true)} readOnly={readOnly} />
          ))}
        </div>
      </div>
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
        <td className="border-2 border-black px-1 py-0.5 text-[10px] font-bold w-32 whitespace-nowrap">{canLabel}</td>
        {nums.map(n => (
          <td key={n} className="border-2 border-black text-center font-bold text-sm px-0.5" style={{minWidth: '1.4rem'}}>{n}</td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-1 py-0.5 text-[10px] w-32 whitespace-nowrap">{composeLabel}</td>
        {nums.map(n => (
          <td key={`${n}-c`} className="border-2 border-black p-0">
            <CheckCell checked={data.compose[n]?.compose} onClick={() => toggle(`compose.${n}.compose`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-1 py-0.5 text-[10px] w-32 whitespace-nowrap">{decomp2Label}</td>
        {nums.map(n => (
          <td key={`${n}-d2`} className="border-2 border-black p-0">
            <CheckCell checked={data.compose[n]?.decompose2} onClick={() => toggle(`compose.${n}.decompose2`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border-2 border-black px-1 py-0.5 text-[10px] w-32 whitespace-nowrap">{decomp3Label}</td>
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
      {/* Counting: "Puedo contar desde 0 hasta" inline with 9-week boxes showing "0 - ____" */}
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">{countingLabel}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <InlineCountingBox key={p} period={p} value={data.counting?.[p]} onChange={(v) => toggle(`counting.${p}`, v, true)} readOnly={readOnly} />
          ))}
        </div>
      </div>
      <div className="border-t-2 border-black p-2">
        <p className="text-xs font-bold mb-1">{initialsLabel}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <InlineInitialsBox key={p} period={p} value={data.parentInitials?.compose?.[p]} onChange={(v) => toggle(`parentInitials.compose.${p}`, v, true)} readOnly={readOnly} />
          ))}
        </div>
      </div>
    </div>
  );
}