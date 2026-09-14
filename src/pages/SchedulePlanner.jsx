import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, GripVertical, Clock, Eye, Pencil, Save, X, Printer } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { WESTWOOD_LOGO_URL } from '@/lib/westwoodLogo';

// ── Time helpers ─────────────────────────────────────────────────────────────
function parseTime(str, period = 'AM') {
  if (!str) return null;
  let [h, m] = str.split(/[: ]/).map(Number);
  if (!h) h = 12;
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + (m || 0);
}

function formatTime(minutes) {
  if (minutes == null) return '';
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

function calculateTimes(startTime, startPeriod, rows) {
  const startMin = parseTime(startTime, startPeriod);
  if (startMin == null) return rows.map(() => ({ start: '', end: '' }));
  const result = [];
  let current = startMin;
  for (const row of rows) {
    const start = current;
    const end = row.is_dismissal ? null : current + (row.minutes || 0);
    result.push({ start, end });
    if (!row.is_dismissal) current = end;
  }
  return result;
}

// ── Default rows (based on the image) ─────────────────────────────────────────
const DEFAULT_ROWS = [
  { subject: 'Block A: Foundations', minutes: 45, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Specials', minutes: 45, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block A: Reading/Vocabulary', minutes: 35, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block A: Small Group', minutes: 20, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Switch', minutes: 5, non_instructional: false, is_switch: true, is_dismissal: false },
  { subject: 'Block B: Foundations', minutes: 40, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block B: Reading/Vocabulary', minutes: 35, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block B: Small Group', minutes: 15, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Lunch', minutes: 30, non_instructional: true, is_switch: false, is_dismissal: false },
  { subject: 'Recess', minutes: 30, non_instructional: true, is_switch: false, is_dismissal: false },
  { subject: 'Block B: Small Group', minutes: 10, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Switch', minutes: 5, non_instructional: false, is_switch: true, is_dismissal: false },
  { subject: 'Block C: Foundations', minutes: 45, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block C: Reading/Vocabulary', minutes: 35, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'Block C: Small Group', minutes: 35, non_instructional: false, is_switch: false, is_dismissal: false },
  { subject: 'DISMISSAL', minutes: 0, non_instructional: true, is_switch: false, is_dismissal: true },
];

// ── Paw logo ──────────────────────────────────────────────────────────────────
function PawLogo() {
  return (
    <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-16 h-16 object-contain shrink-0" />
  );
}

// ── Setup Mode (editable table) ───────────────────────────────────────────────
function SetupMode({ schedule, setSchedule, onSave, saving, classOptions }) {
  const update = (field, value) => setSchedule(s => ({ ...s, [field]: value }));

  const updateRow = (idx, field, value) => {
    setSchedule(s => {
      const rows = [...s.rows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...s, rows };
    });
  };

  const addRow = (idx = null) => {
    setSchedule(s => {
      const newRow = { subject: 'New Subject', minutes: 30, non_instructional: false, is_switch: false, is_dismissal: false };
      const rows = [...s.rows];
      if (idx == null) {
        rows.push(newRow);
      } else {
        rows.splice(idx, 0, newRow);
      }
      return { ...s, rows };
    });
  };

  const removeRow = (idx) => {
    setSchedule(s => ({ ...s, rows: s.rows.filter((_, i) => i !== idx) }));
  };

  const moveRow = (idx, dir) => {
    setSchedule(s => {
      const rows = [...s.rows];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= rows.length) return s;
      [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
      return { ...s, rows };
    });
  };

  const times = calculateTimes(schedule.start_time, schedule.start_period, schedule.rows);

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header settings */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-4 border border-gray-200">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Pencil className="w-5 h-5" /> Schedule Settings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Teacher Name</label>
            <input
              type="text"
              value={schedule.teacher_name || ''}
              onChange={(e) => update('teacher_name', e.target.value)}
              placeholder="Jose Felix"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Schedule Title</label>
            <input
              type="text"
              value={schedule.title || ''}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Daily Schedule Kindergarten Bilingual"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Class</label>
            <select
              value={schedule.class_name || ''}
              onChange={(e) => update('class_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select class…</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-end gap-3 mt-3">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Start of Day</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={schedule.start_time || '7:50'}
                onChange={(e) => update('start_time', e.target.value)}
                placeholder="7:50"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center"
              />
              <select
                value={schedule.start_period || 'AM'}
                onChange={(e) => update('start_period', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Times auto-calculate from this start time + each row's minutes.
          </p>
        </div>
      </div>

      {/* Rows editor */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
        <div className="grid grid-cols-[2rem_2.5rem_1fr_5rem_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-1 px-2 py-2 bg-gray-100 text-xs font-bold text-gray-600 uppercase">
          <div></div>
          <div></div>
          <div>Subject</div>
          <div>Minutes</div>
          <div>Start</div>
          <div>End</div>
          <div>Switch</div>
          <div>Non-Inst.</div>
          <div>Dismissal</div>
        </div>
        {schedule.rows.map((row, idx) => {
          const t = times[idx];
          return (
            <div key={idx} className="group relative grid grid-cols-[2rem_2.5rem_1fr_5rem_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-1 px-2 py-1.5 items-center border-t border-gray-100 text-sm">
              <button onClick={() => removeRow(idx)} className="text-red-500 hover:text-red-700 flex justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <button onClick={() => moveRow(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
                <button onClick={() => moveRow(idx, 1)} disabled={idx === schedule.rows.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
              </div>
              {/* Insert buttons — appear on hover */}
              <div className="absolute left-0 right-0 -top-px h-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <button onClick={() => addRow(idx)} className="pointer-events-auto text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 shadow-sm hover:bg-blue-100 whitespace-nowrap">
                  + Insert above
                </button>
              </div>
              {idx === schedule.rows.length - 1 && (
                <div className="absolute left-0 right-0 bottom-0 h-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                  <button onClick={() => addRow(idx + 1)} className="pointer-events-auto text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 shadow-sm hover:bg-blue-100 whitespace-nowrap">
                    + Insert below
                  </button>
                </div>
              )}
              <input
                type="text"
                value={row.subject}
                onChange={(e) => updateRow(idx, 'subject', e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded text-sm min-w-0"
              />
              <input
                type="number"
                value={row.minutes || 0}
                onChange={(e) => updateRow(idx, 'minutes', parseInt(e.target.value) || 0)}
                disabled={row.is_dismissal}
                className="px-2 py-1 border border-gray-200 rounded text-sm text-center w-full disabled:bg-gray-100"
              />
              <div className="text-center text-xs text-gray-500">{t ? formatTime(t.start) : ''}</div>
              <div className="text-center text-xs text-gray-500">{t && t.end != null ? formatTime(t.end) : '—'}</div>
              <div className="flex justify-center">
                <input type="checkbox" checked={row.is_switch} onChange={(e) => updateRow(idx, 'is_switch', e.target.checked)} className="w-4 h-4" />
              </div>
              <div className="flex justify-center">
                <input type="checkbox" checked={row.non_instructional} onChange={(e) => updateRow(idx, 'non_instructional', e.target.checked)} className="w-4 h-4" />
              </div>
              <div className="flex justify-center">
                <input type="checkbox" checked={row.is_dismissal} onChange={(e) => updateRow(idx, 'is_dismissal', e.target.checked)} className="w-4 h-4" />
              </div>
            </div>
          );
        })}
        <button
          onClick={addRow}
          className="w-full py-2 flex items-center justify-center gap-2 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-gray-200"
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>
      </div>

      <button
        onClick={onSave}
        disabled={saving || !schedule.class_name}
        className="mt-4 w-full py-3 rounded-xl font-black text-white text-sm shadow-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-5 h-5" /> {saving ? 'Saving…' : 'Save Schedule'}
      </button>
    </div>
  );
}

// ── View Mode (formatted table like the image) ────────────────────────────────
function ViewMode({ schedule }) {
  const times = calculateTimes(schedule.start_time, schedule.start_period, schedule.rows);
  const centurySchoolbook = { fontFamily: '"Century Schoolbook", "Times New Roman", serif' };
  const subtitle = (schedule.title || 'Daily Schedule Kindergarten Bilingual').replace(/^Daily Schedule\s*/i, '') || 'Kindergarten Bilingual';

  const HeaderBlock = () => (
    <div className="flex items-center justify-center gap-4 py-4 border-[4px] border-black">
      <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-24 h-24 object-contain shrink-0" />
      <div className="text-center">
        <h1 className="text-3xl font-bold text-red-700 leading-tight" style={centurySchoolbook}>{schedule.teacher_name || 'Teacher'}</h1>
        <h2 className="text-3xl font-bold leading-tight" style={centurySchoolbook}>Daily Schedule</h2>
        <p className="text-3xl font-bold leading-tight" style={centurySchoolbook}>{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="py-4">
      <div className="page-preview">
        {/* Header — centered and big, Century Schoolbook font */}
        <div className="no-print relative">
          <HeaderBlock />
          <button
            onClick={() => {
              document.body.classList.add('dashboard-printing');
              window.print();
              setTimeout(() => document.body.classList.remove('dashboard-printing'), 500);
            }}
            className="absolute right-4 top-4 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100 flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
        {/* Print-only header */}
        <div className="hidden print:block">
          <HeaderBlock />
        </div>

      {/* Table — thin left/right borders, gap below header */}
      <div className="mt-4 border-l border-r border-black">
        {/* Header row */}
        <div className="grid grid-cols-3 bg-[#FF0000] text-white font-black uppercase text-sm">
          <div className="px-3 py-2 text-center border-r border-white/30">TIME</div>
          <div className="px-3 py-2 text-center border-r border-white/30">SUBJECT</div>
          <div className="px-3 py-2 text-center">MINUTES</div>
        </div>

        {/* Body rows */}
        {schedule.rows.map((row, idx) => {
          const t = times[idx];
          const timeStr = t
            ? row.is_dismissal
              ? formatTime(t.start)
              : `${formatTime(t.start)} - ${formatTime(t.end)}`
            : '';

          if (row.non_instructional) {
            return (
              <div key={idx} className="grid grid-cols-3 bg-black text-white font-bold text-sm border-t border-black">
                <div className="px-3 py-2 text-center border-r border-white/20">{timeStr}</div>
                <div className="px-3 py-2 text-center border-r border-white/20 uppercase">{row.subject}</div>
                <div className="px-3 py-2 text-center">{row.is_dismissal ? '' : row.minutes}</div>
              </div>
            );
          }

          return (
            <div key={idx} className="grid grid-cols-3 bg-white text-black text-sm border-t border-black">
              <div className="px-3 py-2 text-center border-r border-black">{timeStr}</div>
              <div
                className={`px-3 py-2 text-center border-r border-black ${row.is_switch ? 'italic' : ''}`}
                style={row.is_switch ? { color: '#D37272' } : {}}
              >
                {row.is_switch ? `*${row.subject}*` : row.subject}
              </div>
              <div className="px-3 py-2 text-center">{row.minutes}</div>
            </div>
          );
        })}
      </div>
        <p className="text-center mt-4 font-bold" style={{fontFamily: '"Century Schoolbook", "Times New Roman", serif', fontSize: '18px'}}>
          Charting the course for Every child!
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SchedulePlanner() {
  const urlParams = new URLSearchParams(window.location.search);
  const classParam = urlParams.get('class') || '';
  const [schedules, setSchedules] = useState([]);
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [mode, setMode] = useState('setup'); // 'setup' | 'view'
  const [saving, setSaving] = useState(false);
  const [classOptions, setClassOptions] = useState([]);

  const loadSchedules = useCallback(async () => {
    try {
      const list = await base44.entities.Schedule.list();
      setSchedules(list);
      if (classParam) {
        const found = list.find(s => s.class_name === classParam);
        if (found) {
          setCurrentSchedule(found);
          setMode('view');
        }
      }
    } catch (e) {
      console.warn('No schedules found:', e);
    }
  }, [classParam]);

  useEffect(() => {
    loadSchedules();
    // Load class options from ClassConfig
    base44.entities.ClassConfig.list().then(configs => {
      setClassOptions(configs.map(c => c.class_name).filter(Boolean));
    }).catch(() => {});
  }, [loadSchedules]);

  const handleNew = () => {
    setCurrentSchedule({
      class_name: classParam || '',
      teacher_name: '',
      title: 'Daily Schedule Kindergarten Bilingual',
      start_time: '7:50',
      start_period: 'AM',
      rows: DEFAULT_ROWS,
    });
    setMode('setup');
  };

  const handleSave = async () => {
    if (!currentSchedule?.class_name) return;
    setSaving(true);
    try {
      const payload = {
        ...currentSchedule,
        school_year: ACTIVE_SCHOOL_YEAR,
      };
      if (currentSchedule.id) {
        await base44.entities.Schedule.update(currentSchedule.id, payload);
      } else {
        const created = await base44.entities.Schedule.create(payload);
        setCurrentSchedule(created);
      }
      await loadSchedules();
      setMode('view');
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSchedule = (sched) => {
    setCurrentSchedule(sched);
    setMode('setup');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="no-print bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-black flex items-center gap-2">
          <Clock className="w-5 h-5" /> Schedule Planner
        </h1>
        <div className="flex items-center gap-2">
          {currentSchedule && mode === 'view' && (
            <button onClick={() => setMode('setup')} className="px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100 flex items-center gap-1.5">
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {currentSchedule && mode === 'setup' && (
            <button onClick={() => setMode('view')} className="px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-100 flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> Preview
            </button>
          )}
          <button onClick={handleNew} className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      {/* Content */}
      {!currentSchedule && schedules.length > 0 && (
        <div className="max-w-4xl mx-auto p-4">
          <h2 className="text-lg font-bold mb-3">Saved Schedules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {schedules.map(s => (
              <button
                key={s.id}
                onClick={() => handleEditSchedule(s)}
                className="text-left p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition"
              >
                <p className="font-bold text-sm">{s.teacher_name || 'Unnamed'} — {s.class_name}</p>
                <p className="text-xs text-gray-500">{s.title}</p>
                <p className="text-xs text-gray-400 mt-1">{s.rows?.length || 0} rows · starts {s.start_time} {s.start_period}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {currentSchedule && mode === 'setup' && (
        <SetupMode
          schedule={currentSchedule}
          setSchedule={setCurrentSchedule}
          onSave={handleSave}
          saving={saving}
          classOptions={classOptions}
        />
      )}

      {currentSchedule && mode === 'view' && (
        <ViewMode schedule={currentSchedule} />
      )}

      {!currentSchedule && schedules.length === 0 && (
        <div className="max-w-md mx-auto mt-20 text-center">
          <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">No schedules yet. Create your first one!</p>
          <button onClick={handleNew} className="px-4 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700">
            Create Schedule
          </button>
        </div>
      )}
    </div>
  );
}