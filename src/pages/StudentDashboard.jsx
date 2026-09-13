import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { WESTWOOD_LOGO_URL } from '@/lib/westwoodLogo';
import { Printer, Users } from 'lucide-react';

// ── Letter sets ───────────────────────────────────────────────────────────────
const EN_LETTERS_ROW1 = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const EN_LETTERS_ROW2 = ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Spanish letters — structured objects:
// {d: display, k: unique data key, p?: phoneme marker, bl?: black out Letra row, tl?: thin left border}
const ES_LETTERS_ROW1 = [
  {d:'O',k:'O'},{d:'o',k:'o',tl:1},{d:'I',k:'I'},{d:'i',k:'i',tl:1},
  {d:'A',k:'A'},{d:'a',k:'a',tl:1},{d:'U',k:'U'},{d:'u',k:'u',tl:1},
  {d:'E',k:'E'},{d:'e',k:'e',tl:1},{d:'M',k:'M'},{d:'m',k:'m',tl:1},
  {d:'P',k:'P'},{d:'p',k:'p',tl:1},{d:'S',k:'S'},{d:'s',k:'s',tl:1},
  {d:'L',k:'L'},{d:'l',k:'l',tl:1},{d:'N',k:'N'},{d:'n',k:'n',tl:1},
  {d:'D',k:'D'},{d:'d',k:'d',tl:1},{d:'T',k:'T'},{d:'t',k:'t',tl:1},
];
const ES_LETTERS_ROW2 = [
  {d:'F',k:'F'},{d:'f',k:'f',tl:1},{d:'B',k:'B'},{d:'b',k:'b',tl:1},
  {d:'R_',k:'R_'},{d:'r',k:'r',tl:1},
  {d:'C',k:'C',p:'/k/'},{d:'c',k:'c',p:'/k/',tl:1},
  {d:'Q',k:'Q'},{d:'q',k:'q',tl:1},{d:'V',k:'V'},{d:'v',k:'v',tl:1},
  {d:'_r_',k:'_r_',bl:1},
  {d:'Ll',k:'Ll',bl:1},{d:'ll',k:'ll',bl:1,tl:1},
  {d:'G',k:'G',p:'/g/'},{d:'g',k:'g',p:'/g/',tl:1},
  {d:'Y',k:'Y'},{d:'y',k:'y',tl:1},{d:'Z',k:'Z'},{d:'z',k:'z',tl:1},
  {d:'H',k:'H'},{d:'h',k:'h',tl:1},
];
const ES_LETTERS_ROW3 = [
  {d:'J',k:'J'},{d:'j',k:'j',tl:1},
  {d:'C',k:'C_s',p:'/s/',bl:1},{d:'c',k:'c_s',p:'/s/',bl:1,tl:1},
  {d:'Ñ',k:'Ñ'},{d:'ñ',k:'ñ',tl:1},
  {d:'G',k:'G_j',p:'/j/',bl:1},{d:'g',k:'g_j',p:'/j/',bl:1,tl:1},
  {d:'Ch',k:'Ch',bl:1},{d:'ch',k:'ch',bl:1,tl:1},
  {d:'K',k:'K'},{d:'k',k:'k',tl:1},{d:'X',k:'X'},{d:'x',k:'x',tl:1},
  {d:'W',k:'W'},{d:'w',k:'w',tl:1},
];
const ALL_ES_LETTERS = [...ES_LETTERS_ROW1, ...ES_LETTERS_ROW2, ...ES_LETTERS_ROW3];

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
  for (const l of [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2]) {
    data.letters[l] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const l of ALL_ES_LETTERS) {
    data.letters[l.k] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const n of [...NUMBERS_ROW1, ...NUMBERS_ROW2]) {
    data.numbers[n] = { read: false, write: false };
  }
  for (const n of [...COMPOSE_ROW1, ...COMPOSE_ROW2]) {
    data.compose[n] = { compose: false, decompose2: false, decompose3: false };
  }
  return data;
}

// ── Checkmark cell — black check, no border, no fill ───────────────────────────
function CheckCell({ checked, onClick, readOnly, blackedOut }) {
  if (blackedOut) {
    return <div className="w-full h-full bg-black print:bg-black" />;
  }
  return (
    <button
      onClick={readOnly ? undefined : onClick}
      disabled={readOnly}
      className={`w-full min-h-7 py-1 flex items-center justify-center transition ${
        checked ? 'text-black' : 'text-transparent hover:bg-gray-100'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className="text-base font-bold leading-none">✓</span>
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div className="bg-[#FF0000] text-white font-bold uppercase text-sm text-center py-1.5 border-2 border-black">
      {title}
    </div>
  );
}

// ── Parent initials row ───────────────────────────────────────────────────────
function ParentInitialsRow({ label, data, toggle, path, readOnly }) {
  return (
    <div className="border-t-2 border-black p-3">
      <p className="text-xs font-bold mb-2">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PERIODS.map(p => (
          <div key={p} className="border-2 border-black rounded px-2 py-1 text-xs">
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

// ── Thin border style helper for Spanish grid ────────────────────────────────
function cellBorderStyle(letters, ci) {
  const style = {};
  if (letters[ci].tl) style.borderLeftWidth = '1px';
  if (ci < letters.length - 1 && letters[ci + 1].tl) style.borderRightWidth = '1px';
  return style;
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
      <div className="flex flex-wrap gap-4 px-3 py-2 border-t-2 border-black text-xs">
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
    <div className="border-2 border-black">
      <SectionHeader title="Identificación de letras y sonidos" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {letterRows.map((row, ri) => (
              <React.Fragment key={`lr-${ri}`}>
                <tr>
                  <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16"></td>
                  {row.letters.map((l, ci) => (
                    <td key={`${l.k}-${ci}`} className="border-2 border-black text-center px-1 min-w-[1.6rem]"
                      style={cellBorderStyle(row.letters, ci)}>
                      <div className="font-bold text-sm leading-tight">{l.d}</div>
                      {l.p && <div className="text-[10px] font-normal text-gray-600 leading-tight">{l.p}</div>}
                    </td>
                  ))}
                </tr>
                {skillRows.map(sr => (
                  <tr key={`${ri}-${sr.key}`}>
                    <td className="border-2 border-black px-2 py-1 text-xs font-bold w-16">{sr.label}</td>
                    {row.letters.map((l, ci) => (
                      <td key={`${l.k}-${ci}-${sr.key}`} className="border-2 border-black p-0"
                        style={cellBorderStyle(row.letters, ci)}>
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
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 px-3 py-2 border-t-2 border-black text-xs">
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
      <div className="border-t-2 border-black p-3">
        <p className="text-xs font-bold mb-2">{countingLabel}____</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIODS.map(p => (
            <div key={p} className="border-2 border-black rounded px-2 py-1 text-xs">
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

// ── Print header (visible only during print) ──────────────────────────────────
function PrintHeader({ student, lang, class_name }) {
  return (
    <div className="flex items-center gap-3 mb-3 pb-2 border-b-2 border-black">
      <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-14 h-14 object-contain shrink-0" />
      <div className="flex-1">
        <h1 className="text-base font-black">WESTWOOD ELEMENTARY</h1>
        <p className="text-xs font-bold text-gray-600">
          {lang === 'es' ? 'FORMULARIO DE INFORMACIÓN DEL ESTUDIANTE' : 'STUDENT INFORMATION FORM'}
        </p>
        <p className="text-xs mt-1">
          <span className="font-bold">{lang === 'es' ? 'Nombre:' : 'Name:'}</span> {student?.name || '—'}
          <span className="font-bold ml-3">ID:</span> {student?.barcode_number || '—'}
          <span className="font-bold ml-3">{lang === 'es' ? 'Maestro(a):' : 'Teacher:'}</span> {class_name || student?.class_name || '—'}
        </p>
      </div>
    </div>
  );
}

// ── Grid sections (reused for screen + print) ─────────────────────────────────
function DashboardSections({ data, toggle, readOnly, lang }) {
  return (
    <div className="space-y-4">
      {lang === 'es' ? (
        <SpanishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
      ) : (
        <EnglishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
      )}
      <NumbersGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
      <ComposeGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
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

  const [classOptions, setClassOptions] = useState([]);
  const [selectedClass, setSelectedClass] = useState(classParam || '');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentParam || '');
  const [dashboard, setDashboard] = useState(null);
  const [data, setData] = useState(createEmptyData());
  const [saving, setSaving] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);
  const [printAllData, setPrintAllData] = useState(null);
  const [lang, setLang] = useState('es');

  // Load class options
  useEffect(() => {
    base44.entities.ClassConfig.list().then(configs => {
      setClassOptions(configs.map(c => c.class_name).filter(Boolean).sort());
    }).catch(e => console.warn('Load classes failed:', e));
  }, []);

  // Load students when class selected
  useEffect(() => {
    const cls = selectedClass || classParam;
    if (cls) {
      base44.entities.Student.filter({ class_name: cls, school_year: ACTIVE_SCHOOL_YEAR })
        .then(list => {
          setStudents(list.sort((a, b) => a.student_number - b.student_number));
          if (list.length > 0 && !selectedStudentId) {
            setSelectedStudentId(list[0].id);
          }
        })
        .catch(e => console.warn('Load students failed:', e));
    }
  }, [selectedClass, classParam]);

  // Set language from student
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

  const handlePrint = () => {
    document.body.classList.add('dashboard-printing');
    window.print();
    setTimeout(() => document.body.classList.remove('dashboard-printing'), 500);
  };

  const handlePrintAll = async () => {
    if (!students.length) return;
    setPrintingAll(true);
    try {
      const allData = [];
      for (const student of students) {
        let dData = createEmptyData();
        try {
          const list = await base44.entities.StudentDashboard.filter({ student_id: student.id, school_year: ACTIVE_SCHOOL_YEAR });
          if (list.length > 0 && list[0].dashboard_data) {
            dData = JSON.parse(list[0].dashboard_data);
          }
        } catch (e) {}
        allData.push({ student, data: dData, lang: student.language || 'es' });
      }
      setPrintAllData(allData);
      setTimeout(() => {
        document.body.classList.add('dashboard-printing');
        window.print();
        setTimeout(() => {
          document.body.classList.remove('dashboard-printing');
          setPrintAllData(null);
        }, 500);
      }, 300);
    } finally {
      setPrintingAll(false);
    }
  };

  const readOnly = urlParams.get('readonly') === 'true';
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Screen header (hidden on print) ── */}
      <div className="no-print border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-16 h-16 object-contain shrink-0" />
          <div>
            <h1 className="text-lg font-black">WESTWOOD ELEMENTARY</h1>
            <p className="text-sm font-bold text-gray-600">
              {lang === 'es' ? 'FORMULARIO DE INFORMACIÓN DEL ESTUDIANTE' : 'STUDENT INFORMATION FORM'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {students.length > 0 && (
            <button
              onClick={handlePrintAll}
              disabled={printingAll}
              className="px-3 py-2 rounded-lg font-bold text-white text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" /> {printingAll ? 'Loading…' : 'Print All'}
            </button>
          )}
          {selectedStudentId && (
            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded-lg font-bold border border-gray-300 hover:bg-gray-100 text-sm flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !selectedStudentId}
            className="px-4 py-2 rounded-lg font-bold text-white text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Class/student picker (hidden on print) ── */}
      <div className="no-print px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-2 items-center">
        <select
          value={selectedClass}
          onChange={(e) => { setSelectedClass(e.target.value); setSelectedStudentId(''); setStudents([]); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select class…</option>
          {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {students.length > 0 && (
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                #{s.student_number} {s.name || ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Student info bar (hidden on print) ── */}
      {selectedStudentId && (
        <div className="no-print px-4 py-2 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><span className="font-bold">{lang === 'es' ? 'Nombre:' : 'Name:'}</span> {selectedStudent?.name || '—'}</div>
          <div><span className="font-bold">ID:</span> {selectedStudent?.barcode_number || '—'}</div>
          <div><span className="font-bold">{lang === 'es' ? 'Maestro(a):' : 'Teacher:'}</span> {selectedClass || classParam || '—'}</div>
          <div><span className="font-bold">{lang === 'es' ? 'Grado:' : 'Grade:'}</span> {selectedStudent?.grade || 'K'}</div>
        </div>
      )}

      {/* ── Print-only header for single print ── */}
      {selectedStudentId && !printAllData && (
        <div className="hidden print:block px-4 pt-2">
          <PrintHeader student={selectedStudent} lang={lang} class_name={selectedClass || classParam} />
        </div>
      )}

      {/* ── Main grid content ── */}
      {selectedStudentId ? (
        <div className={`p-4 max-w-[1400px] mx-auto ${printAllData ? 'print:hidden' : ''}`}>
          <DashboardSections data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
        </div>
      ) : (
        <div className="no-print max-w-md mx-auto mt-20 text-center text-gray-500">
          {!selectedClass ? (
            <p>Select a class above to load students.</p>
          ) : selectedClass && students.length === 0 ? (
            <p>No students found in this class.</p>
          ) : (
            <p>Select a student above to view their dashboard.</p>
          )}
        </div>
      )}

      {/* ── Print All container (hidden on screen, visible on print) ── */}
      {printAllData && (
        <div className="hidden print:block">
          {printAllData.map(({ student, data: dData, lang: dLang }, idx) => (
            <div key={idx} className="print:break-after-page px-4 py-2">
              <PrintHeader student={student} lang={dLang} class_name={selectedClass || classParam} />
              <DashboardSections data={dData} toggle={() => {}} readOnly={true} lang={dLang} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}