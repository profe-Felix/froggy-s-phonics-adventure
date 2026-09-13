import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// ── Letter sets ───────────────────────────────────────────────────────────────
const EN_LETTERS_ROW1 = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const EN_LETTERS_ROW2 = ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

const ES_LETTERS_ROW1 = ['O','o','I','i','A','a','U','u','E','e','M','m','P','p','S','s','L','l','N','n','D','d','T','t'];
const ES_LETTERS_ROW2 = ['F','f','B','b','R','r','C','c','Q','q','V','v','R','Ll','ll','G','g','Y','y','Z','z','H','h'];
const ES_LETTERS_ROW3 = ['J','j','C','c','Ñ','ñ','G','g','Ch','ch','K','k','X','x','W','w'];

const NUMBERS_ROW1 = ['0','1','2','3','4','5','6','7','8','9','10'];
const NUMBERS_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];

const COMPOSE_ROW1 = ['1','2','3','4','5','6','7','8','9','10'];
const COMPOSE_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];

const PERIODS = ['1st', '2nd', '3rd', '4th'];

// ── Default empty dashboard data ──────────────────────────────────────────────
function createEmptyData() {
  const data = {
    letters: {},
    allUpper: false,
    allLower: false,
    allSounds: false,
    numbers: {},
    compose: {},
    counting: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    parentInitials: {
      letters: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      numbers: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      compose: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    },
  };
  const allLetters = [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2];
  for (const l of allLetters) {
    data.letters[l] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const n of [...NUMBERS_ROW1, ...NUMBERS_ROW2]) {
    data.numbers[n] = { read: false, write: false };
  }
  for (const n of [...COMPOSE_ROW1, ...COMPOSE_ROW2]) {
    data.compose[n] = { compose: false, decompose2: false, decompose3: false };
  }
  return data;
}

// ── Checkmark cell ────────────────────────────────────────────────────────────
function CheckCell({ checked, onClick, readOnly }) {
  return (
    <button
      onClick={readOnly ? undefined : onClick}
      disabled={readOnly}
      className={`w-full h-7 flex items-center justify-center border border-black transition ${
        checked ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      {checked && <span className="text-xs font-bold">✓</span>}
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div className="bg-[#FF0000] text-white font-bold uppercase text-sm text-center py-1.5 border border-black">
      {title}
    </div>
  );
}

// ── Parent initials row ───────────────────────────────────────────────────────
function ParentInitialsRow({ label, data, toggle, path, readOnly }) {
  return (
    <div className="border-t border-black p-3">
      <p className="text-xs font-bold mb-2">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PERIODS.map(p => (
          <div key={p} className="border border-black rounded px-2 py-1 text-xs">
            <span className="font-bold">{p} 9 Weeks:</span>
            <input
              type="text"
              value={data?.[p] || ''}
              onChange={(e) => toggle(`${path}.${p}`, e.target.value, true)}
              readOnly={readOnly}
              className="w-16 ml-1 border-b border-gray-300 outline-none bg-transparent"
              placeholder="______"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Letter grid (English) ─────────────────────────────────────────────────────
function EnglishLetterGrid({ data, toggle, readOnly }) {
  const rows = [
    { label: 'Upper Case', key: 'upper' },
    { label: 'Lower Case', key: 'lower' },
    { label: 'Sounds', key: 'sound' },
    { label: 'Formation', key: 'formation' },
  ];
  const allLetters = [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2];

  return (
    <div className="border border-black">
      <SectionHeader title="Letter and Sound Identification" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20"></td>
              {allLetters.map(l => (
                <td key={l} className="border border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{l}</td>
              ))}
            </tr>
            {rows.map(row => (
              <tr key={row.key}>
                <td className="border border-black px-2 py-1 text-xs font-bold w-20">{row.label}</td>
                {allLetters.map(l => (
                  <td key={`${l}-${row.key}`} className="border border-black p-0">
                    <CheckCell checked={data.letters[l]?.[row.key]} onClick={() => toggle(`letters.${l}.${row.key}`)} readOnly={readOnly} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 px-3 py-2 border-t border-black text-xs">
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} /> Knows all upper case
        </label>
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} /> Knows all lower case
        </label>
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} /> Knows all sounds
        </label>
      </div>
      <ParentInitialsRow label="Parent Initial each 9 weeks" data={data.parentInitials?.letters} toggle={toggle} path="parentInitials.letters" readOnly={readOnly} />
    </div>
  );
}

// ── Letter grid (Spanish) ─────────────────────────────────────────────────────
function SpanishLetterGrid({ data, toggle, readOnly }) {
  const letterRows = [
    { letters: ES_LETTERS_ROW1 },
    { letters: ES_LETTERS_ROW2 },
    { letters: ES_LETTERS_ROW3 },
  ];
  const skillRows = [
    { label: 'Letra', key: 'upper' },
    { label: 'Sonidos', key: 'sound' },
    { label: 'Formación', key: 'formation' },
  ];

  return (
    <div className="border border-black">
      <SectionHeader title="Identificación de letras y sonidos" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {letterRows.map((row, ri) => (
              <React.Fragment key={`lr-${ri}`}>
                <tr>
                  <td className="border border-black px-2 py-1 text-xs font-bold w-16"></td>
                  {row.letters.map((l, ci) => (
                    <td key={`${l}-${ci}`} className="border border-black text-center font-bold text-sm px-1 min-w-[1.6rem]">{l}</td>
                  ))}
                </tr>
                {skillRows.map(sr => (
                  <tr key={`${ri}-${sr.key}`}>
                    <td className="border border-black px-2 py-1 text-xs font-bold w-16">{sr.label}</td>
                    {row.letters.map((l, ci) => (
                      <td key={`${l}-${ci}-${sr.key}`} className="border border-black p-0">
                        <CheckCell
                          checked={data.letters[l]?.[sr.key]}
                          onClick={() => toggle(`letters.${l}.${sr.key}`)}
                          readOnly={readOnly}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 px-3 py-2 border-t border-black text-xs">
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allUpper} onClick={() => toggle('allUpper')} readOnly={readOnly} /> Conoce todas las mayúsculas
        </label>
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allLower} onClick={() => toggle('allLower')} readOnly={readOnly} /> Conoce todas las minúsculas
        </label>
        <label className="flex items-center gap-2 font-bold">
          <CheckCell checked={data.allSounds} onClick={() => toggle('allSounds')} readOnly={readOnly} /> Conoce todos los sonidos
        </label>
      </div>
      <ParentInitialsRow label="Iniciales de los padres" data={data.parentInitials?.letters} toggle={toggle} path="parentInitials.letters" readOnly={readOnly} />
    </div>
  );
}

// ── Numbers grid ──────────────────────────────────────────────────────────────
function NumbersGrid({ data, toggle, readOnly, lang }) {
  const title = lang === 'es' ? 'Número 0-20' : 'Numbers 0-20';
  const readLabel = lang === 'es' ? 'Leer' : 'Read';
  const writeLabel = lang === 'es' ? 'Escribir' : 'Write';
  const initialsLabel = lang === 'es' ? 'Iniciales de los padres' : 'Parent Initials';
  const canLabel = lang === 'es' ? 'Puedo' : 'I can';

  return (
    <div className="border border-black">
      <SectionHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20">{canLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={n} className="border border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20">{readLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-r`} className="border border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20">{writeLabel}</td>
              {NUMBERS_ROW1.map(n => (
                <td key={`${n}-w`} className="border border-black p-0">
                  <CheckCell checked={data.numbers[n]?.write} onClick={() => toggle(`numbers.${n}.write`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20"></td>
              {NUMBERS_ROW2.map(n => (
                <td key={n} className="border border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
              ))}
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20">{readLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-r`} className="border border-black p-0">
                  <CheckCell checked={data.numbers[n]?.read} onClick={() => toggle(`numbers.${n}.read`)} readOnly={readOnly} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-xs font-bold w-20">{writeLabel}</td>
              {NUMBERS_ROW2.map(n => (
                <td key={`${n}-w`} className="border border-black p-0">
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

// ── Compose/Decompose grid ────────────────────────────────────────────────────
function ComposeGrid({ data, toggle, readOnly, lang }) {
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
        <td className="border border-black px-2 py-1 text-xs font-bold w-24">{canLabel}</td>
        {nums.map(n => (
          <td key={n} className="border border-black text-center font-bold text-sm px-1 min-w-[1.8rem]">{n}</td>
        ))}
      </tr>
      <tr>
        <td className="border border-black px-2 py-1 text-xs w-24">{composeLabel}</td>
        {nums.map(n => (
          <td key={`${n}-c`} className="border border-black p-0">
            <CheckCell checked={data.compose[n]?.compose} onClick={() => toggle(`compose.${n}.compose`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border border-black px-2 py-1 text-xs w-24">{decomp2Label}</td>
        {nums.map(n => (
          <td key={`${n}-d2`} className="border border-black p-0">
            <CheckCell checked={data.compose[n]?.decompose2} onClick={() => toggle(`compose.${n}.decompose2`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
      <tr>
        <td className="border border-black px-2 py-1 text-xs w-24">{decomp3Label}</td>
        {nums.map(n => (
          <td key={`${n}-d3`} className="border border-black p-0">
            <CheckCell checked={data.compose[n]?.decompose3} onClick={() => toggle(`compose.${n}.decompose3`)} readOnly={readOnly} />
          </td>
        ))}
      </tr>
    </>
  );

  return (
    <div className="border border-black">
      <SectionHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {renderBlock(COMPOSE_ROW1)}
            {renderBlock(COMPOSE_ROW2)}
          </tbody>
        </table>
      </div>
      <div className="border-t border-black p-3">
        <p className="text-xs font-bold mb-2">{countingLabel}____</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <div key={p} className="border border-black rounded px-2 py-1 text-xs">
              <span className="font-bold">{p} 9 Weeks:</span>
              <input
                type="text"
                value={data.counting?.[p] || ''}
                onChange={(e) => toggle(`counting.${p}`, e.target.value, true)}
                readOnly={readOnly}
                className="w-16 ml-1 border-b border-gray-300 outline-none bg-transparent"
                placeholder="0 - ___"
              />
            </div>
          ))}
        </div>
      </div>
      <ParentInitialsRow label={initialsLabel} data={data.parentInitials?.compose} toggle={toggle} path="parentInitials.compose" readOnly={readOnly} />
    </div>
  );
}

// ── Paw logo ──────────────────────────────────────────────────────────────────
function PawLogo() {
  return (
    <div className="w-14 h-14 rounded-full bg-white border-2 border-black flex items-center justify-center shrink-0">
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <ellipse cx="50" cy="65" rx="22" ry="18" fill="#FF0000"/>
        <circle cx="30" cy="42" r="9" fill="#FF0000"/>
        <circle cx="70" cy="42" r="9" fill="#FF0000"/>
        <circle cx="38" cy="28" r="7" fill="#FF0000"/>
        <circle cx="62" cy="28" r="7" fill="#FF0000"/>
      </svg>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const urlParams = new URLSearchParams(window.location.search);
  const role = urlParams.get('role') || '';
  const classParam = urlParams.get('class') || '';
  const studentParam = urlParams.get('student') || '';
  const isTeacher = role === 'teacher';

  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentParam || '');
  const [dashboard, setDashboard] = useState(null);
  const [data, setData] = useState(createEmptyData());
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState('es');

  useEffect(() => {
    if (isTeacher && classParam) {
      base44.entities.Student.filter({ class_name: classParam, school_year: ACTIVE_SCHOOL_YEAR })
        .then(list => {
          setStudents(list.sort((a, b) => a.student_number - b.student_number));
          if (list.length > 0 && !selectedStudentId) {
            setSelectedStudentId(list[0].id);
          }
        })
        .catch(e => console.warn('Load students failed:', e));
    }
  }, [isTeacher, classParam]);

  useEffect(() => {
    if (selectedStudentId) {
      const student = students.find(s => s.id === selectedStudentId);
      if (student?.language) setLang(student.language);
    }
  }, [selectedStudentId, students]);

  const loadDashboard = useCallback(async () => {
    if (!selectedStudentId) return;
    try {
      const list = await base44.entities.StudentDashboard.filter({ student_id: selectedStudentId, school_year: ACTIVE_SCHOOL_YEAR });
      if (list.length > 0) {
        const d = list[0];
        setDashboard(d);
        setData(d.dashboard_data ? JSON.parse(d.dashboard_data) : createEmptyData());
      } else {
        setDashboard(null);
        setData(createEmptyData());
      }
    } catch (e) {
      console.warn('Load dashboard failed:', e);
    }
  }, [selectedStudentId]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const toggle = useCallback((path, value, isText = false) => {
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      const lastKey = parts[parts.length - 1];
      obj[lastKey] = isText ? value : !obj[lastKey];
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      const student = students.find(s => s.id === selectedStudentId);
      const payload = {
        student_id: selectedStudentId,
        student_number: student?.student_number,
        class_name: student?.class_name || classParam,
        school_year: ACTIVE_SCHOOL_YEAR,
        language: lang,
        dashboard_data: JSON.stringify(data),
      };
      if (dashboard?.id) {
        await base44.entities.StudentDashboard.update(dashboard.id, payload);
      } else {
        const created = await base44.entities.StudentDashboard.create(payload);
        setDashboard(created);
      }
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !isTeacher && !studentParam;

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <PawLogo />
          <div>
            <h1 className="text-lg font-black">WESTWOOD ELEMENTARY</h1>
            <p className="text-sm font-bold text-gray-600">
              {lang === 'es' ? 'FORMULARIO DE INFORMACIÓN DEL ESTUDIANTE' : 'STUDENT INFORMATION FORM'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !selectedStudentId}
          className="px-4 py-2 rounded-lg font-bold text-white text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {isTeacher && students.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>
                #{s.student_number} {s.name || ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedStudentId && (
        <div className="px-4 py-2 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><span className="font-bold">{lang === 'es' ? 'Nombre:' : 'Name:'}</span> {students.find(s => s.id === selectedStudentId)?.name || '—'}</div>
          <div><span className="font-bold">ID:</span> {students.find(s => s.id === selectedStudentId)?.barcode_number || '—'}</div>
          <div><span className="font-bold">{lang === 'es' ? 'Maestro(a):' : 'Teacher:'}</span> {classParam || '—'}</div>
          <div><span className="font-bold">{lang === 'es' ? 'Grado:' : 'Grade:'}</span> {students.find(s => s.id === selectedStudentId)?.grade || 'K'}</div>
        </div>
      )}

      {selectedStudentId ? (
        <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
          {lang === 'es' ? (
            <SpanishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
          ) : (
            <EnglishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
          )}
          <NumbersGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
          <ComposeGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
        </div>
      ) : (
        <div className="max-w-md mx-auto mt-20 text-center text-gray-500">
          <p>Select a student to view their dashboard.</p>
        </div>
      )}
    </div>
  );
}