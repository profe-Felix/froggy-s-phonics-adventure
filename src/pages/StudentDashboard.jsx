import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { createEmptyData, PERIODS } from '@/lib/dashboardData';
import { DashboardHeader, PrintHeader } from '@/components/dashboard/DashboardHeader';
import { SpanishLetterGrid } from '@/components/dashboard/SpanishLetterGrid';
import { EnglishLetterGrid, NumbersGrid, ComposeGrid } from '@/components/dashboard/MathGrids';
import { Printer, Users, FileText, Settings } from 'lucide-react';

function createDefaultReportSettings() {
  const defaults = createEmptyData();

  return {
    period_dates: { ...defaults.periodDates },
    es_last_letter_learned: { ...defaults.lastLetterLearned },
    es_last_sight_word_learned: {
      ...defaults.lastSightWordLearned,
    },
    en_last_letter_learned: {
      '1st': '',
      '2nd': '',
      '3rd': '',
      '4th': '',
    },
    en_last_sight_word_learned: {
      '1st': '',
      '2nd': '',
      '3rd': '',
      '4th': '',
    },
  };
}

function DashboardSections({ data, toggle, readOnly, lang, frontBack }) {
  return (
    <div className="space-y-4">
      <div className={frontBack ? 'print:break-after-page' : ''}>
        {lang === 'es' ? (
          <SpanishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
        ) : (
          <EnglishLetterGrid data={data} toggle={toggle} readOnly={readOnly} />
        )}
      </div>
      {frontBack && (
        <div className="no-print page-break-indicator">
          <span>Page break — Back of page</span>
        </div>
      )}
      <NumbersGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
      <ComposeGrid data={data} toggle={toggle} readOnly={readOnly} lang={lang} />
    </div>
  );
}

export default function StudentDashboard() {
  const urlParams = new URLSearchParams(window.location.search);
  const classParam = urlParams.get('class') || '';
  const studentParam = urlParams.get('student') || '';
  const readOnly = urlParams.get('readonly') === 'true';

  const [classOptions, setClassOptions] = useState([]);
  const [classConfigs, setClassConfigs] = useState([]);
  const [selectedClass, setSelectedClass] = useState(classParam || '');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentParam || '');
  const [dashboard, setDashboard] = useState(null);
  const [data, setData] = useState(createEmptyData());
  const [saving, setSaving] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);
  const [printAllData, setPrintAllData] = useState(null);
  const [frontBack, setFrontBack] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsRecord, setSettingsRecord] = useState(null);
  const [reportSettings, setReportSettings] = useState(
    createDefaultReportSettings
  );

  const activeClassName = selectedClass || classParam;
  const activeClassConfig = classConfigs.find(
    (config) => config.class_name === activeClassName
  );
  const lang = activeClassConfig?.language || 'es';

  useEffect(() => {
    base44.entities.ClassConfig.list()
      .then((configs) => {
        setClassConfigs(configs);
        setClassOptions(
          configs
            .map((config) => config.class_name)
            .filter(Boolean)
            .sort()
        );
      })
      .catch((error) =>
        console.warn('Load classes failed:', error)
      );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReportSettings() {
      try {
        const records =
          await base44.entities.StudentDashboardSettings.filter({
            school_year: ACTIVE_SCHOOL_YEAR,
          });

        if (cancelled) return;

        const saved = records[0] || null;
        const defaults = createDefaultReportSettings();

        setSettingsRecord(saved);
        setReportSettings({
          period_dates: {
            ...defaults.period_dates,
            ...(saved?.period_dates || {}),
          },
          es_last_letter_learned: {
            ...defaults.es_last_letter_learned,
            ...(saved?.es_last_letter_learned || {}),
          },
          es_last_sight_word_learned: {
            ...defaults.es_last_sight_word_learned,
            ...(saved?.es_last_sight_word_learned || {}),
          },
          en_last_letter_learned: {
            ...defaults.en_last_letter_learned,
            ...(saved?.en_last_letter_learned || {}),
          },
          en_last_sight_word_learned: {
            ...defaults.en_last_sight_word_learned,
            ...(saved?.en_last_sight_word_learned || {}),
          },
        });
      } catch (error) {
        console.warn(
          'Load Student Dashboard settings failed:',
          error
        );
      }
    }

    loadReportSettings();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const toggle = useCallback(
    (path, value, isText = false) => {
      const parts = path.split('.');
      const root = parts[0];
      const period = parts[1];

      const globalSection =
        root === 'periodDates'
          ? 'period_dates'
          : root === 'lastLetterLearned'
            ? `${lang}_last_letter_learned`
            : root === 'lastSightWordLearned'
              ? `${lang}_last_sight_word_learned`
              : '';

      if (globalSection && period) {
        setReportSettings((previous) => ({
          ...previous,
          [globalSection]: {
            ...(previous[globalSection] || {}),
            [period]: value,
          },
        }));
        return;
      }

      setData((previous) => {
        const next = JSON.parse(JSON.stringify(previous));
        let object = next;

        for (let index = 0; index < parts.length - 1; index++) {
          if (!object[parts[index]]) {
            object[parts[index]] = {};
          }

          object = object[parts[index]];
        }

        const lastKey = parts[parts.length - 1];
        object[lastKey] = isText
          ? value
          : !object[lastKey];

        return next;
      });
    },
    [lang]
  );

  const handleSave = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      const settingsPayload = {
        school_year: ACTIVE_SCHOOL_YEAR,
        period_dates: reportSettings.period_dates,
        es_last_letter_learned:
          reportSettings.es_last_letter_learned,
        es_last_sight_word_learned:
          reportSettings.es_last_sight_word_learned,
        en_last_letter_learned:
          reportSettings.en_last_letter_learned,
        en_last_sight_word_learned:
          reportSettings.en_last_sight_word_learned,
      };

      if (settingsRecord?.id) {
        await base44.entities.StudentDashboardSettings.update(
          settingsRecord.id,
          settingsPayload
        );
      } else {
        const createdSettings =
          await base44.entities.StudentDashboardSettings.create(
            settingsPayload
          );

        setSettingsRecord(createdSettings);
      }

      const student = students.find(
        (studentRecord) =>
          studentRecord.id === selectedStudentId
      );

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

  const selectedStudent = students.find(
    (student) => student.id === selectedStudentId
  );
  const className = selectedClass || classParam;

  const displayData = {
    ...data,
    periodDates: reportSettings.period_dates,
    lastLetterLearned:
      lang === 'en'
        ? reportSettings.en_last_letter_learned
        : reportSettings.es_last_letter_learned,
    lastSightWordLearned:
      lang === 'en'
        ? reportSettings.en_last_sight_word_learned
        : reportSettings.es_last_sight_word_learned,
  };

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar (hidden on print) */}
      <div className="no-print border-b border-gray-200 px-4 py-2 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          {students.length > 0 && (
            <button
              onClick={handlePrintAll}
              disabled={printingAll}
              className="px-3 py-1.5 rounded-lg font-bold text-white text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" /> {printingAll ? 'Loading…' : 'Print All'}
            </button>
          )}
          {selectedStudentId && (
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg font-bold border border-gray-300 hover:bg-gray-100 text-sm flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          )}
          <button
            onClick={() => setFrontBack(!frontBack)}
            className={`px-3 py-1.5 rounded-lg font-bold text-sm border flex items-center gap-1.5 ${frontBack ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 hover:bg-gray-100'}`}
          >
            <FileText className="w-4 h-4" /> Front & Back: {frontBack ? 'ON' : 'OFF'}
          </button>
          {selectedStudentId && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-1.5 rounded-lg font-bold text-sm border flex items-center gap-1.5 ${showSettings ? 'bg-yellow-500 text-white border-yellow-500' : 'border-gray-300 hover:bg-gray-100'}`}
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !selectedStudentId}
          className="px-4 py-1.5 rounded-lg font-bold text-white text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Class/student picker (hidden on print) */}
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

      {/* Settings panel — última letra per period (not printed) */}
      {showSettings && selectedStudentId && (
        <div className="no-print bg-yellow-50 border-b border-yellow-200 px-4 py-3">
          <p className="text-xs font-bold mb-2 text-yellow-800">Configuración: Última letra aprendida (no se imprime)</p>
          <div className="flex flex-wrap gap-3">
            {PERIODS.map((p, i) => (
              <div key={p} className="flex items-center gap-1">
                <label className="text-xs font-bold whitespace-nowrap">{p} 9 Weeks:</label>
                <input
                  type="text"
                  value={data.lastLetterLearned?.[p] || ''}
                  onChange={(e) => toggle(`lastLetterLearned.${p}`, e.target.value, true)}
                  className="w-12 border border-gray-300 rounded px-1 py-0.5 text-xs"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content — sheet preview wrapper */}
      {selectedStudentId ? (
        <div className="pb-4 print:py-0">
          <div className={`page-preview ${printAllData ? 'print:hidden' : ''}`} style={{ border: 'none' }}>
            <DashboardHeader student={selectedStudent} lang={lang} class_name={className} />
            <div className="mt-4">
              <DashboardSections data={data} toggle={toggle} readOnly={readOnly} lang={lang} frontBack={frontBack} />
            </div>
          </div>
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

      {/* Print All container — each student on its own page-preview sheet */}
      {printAllData && (
        <div className="hidden print:block">
          {printAllData.map(({ student, data: dData, lang: dLang }, idx) => (
            <div key={idx} className="page-preview print:break-after-page" style={{ border: 'none' }}>
              <PrintHeader student={student} lang={dLang} class_name={className} />
              <div className="mt-4">
                <DashboardSections data={dData} toggle={() => {}} readOnly={true} lang={dLang} frontBack={frontBack} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}