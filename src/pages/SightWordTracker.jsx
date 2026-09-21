import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import {
  createEmptyData,
  getSightWordSequence,
  mergeDashboardData,
} from '@/lib/dashboardData';

const MODULES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function SightWordTracker() {
  const [classConfigs, setClassConfigs] =
    useState([]);
  const [selectedClass, setSelectedClass] =
    useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] =
    useState('');
  const [selectedModule, setSelectedModule] =
    useState(1);

  const [dashboardRecord, setDashboardRecord] =
    useState(null);
  const [dashboardData, setDashboardData] =
    useState(createEmptyData());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] =
    useState('');

  const spanishClasses = useMemo(
    () =>
      classConfigs
        .filter(
          (config) =>
            config.class_name &&
            config.language !== 'en'
        )
        .sort((a, b) =>
          a.class_name.localeCompare(b.class_name)
        ),
    [classConfigs]
  );

  const selectedStudentIndex = students.findIndex(
    (student) => student.id === selectedStudentId
  );

  const selectedStudent =
    students[selectedStudentIndex] || null;

  const moduleWords = useMemo(
    () =>
      getSightWordSequence().filter(
        (item) =>
          item.module_number === selectedModule
      ),
    [selectedModule]
  );

  useEffect(() => {
    base44.entities.ClassConfig.list()
      .then((records) => {
        setClassConfigs(records);

        const firstSpanishClass = records
          .filter(
            (config) =>
              config.class_name &&
              config.language !== 'en'
          )
          .sort((a, b) =>
            a.class_name.localeCompare(
              b.class_name
            )
          )[0];

        if (firstSpanishClass) {
          setSelectedClass(
            firstSpanishClass.class_name
          );
        }
      })
      .catch((error) => {
        console.warn(
          'Load classes failed:',
          error
        );
      });
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      setSelectedStudentId('');
      return;
    }

    setLoading(true);
    setSelectedStudentId('');
    setDashboardRecord(null);
    setDashboardData(createEmptyData());

    base44.entities.Student.filter({
      class_name: selectedClass,
      school_year: ACTIVE_SCHOOL_YEAR,
    })
      .then((records) => {
        const sorted = [...records].sort(
          (a, b) =>
            Number(a.student_number || 0) -
            Number(b.student_number || 0)
        );

        setStudents(sorted);

        if (sorted.length > 0) {
          setSelectedStudentId(sorted[0].id);
        }
      })
      .catch((error) => {
        console.warn(
          'Load students failed:',
          error
        );
      })
      .finally(() => setLoading(false));
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedStudentId) {
      setDashboardRecord(null);
      setDashboardData(createEmptyData());
      return;
    }

    let cancelled = false;

    async function loadStudentDashboard() {
      setLoading(true);
      setSavedMessage('');

      try {
        const records =
          await base44.entities.StudentDashboard.filter(
            {
              student_id: selectedStudentId,
              school_year: ACTIVE_SCHOOL_YEAR,
            }
          );

        if (cancelled) return;

        const record = records[0] || null;
        setDashboardRecord(record);

        if (record?.dashboard_data) {
          setDashboardData(
            mergeDashboardData(
              JSON.parse(record.dashboard_data)
            )
          );
        } else {
          setDashboardData(createEmptyData());
        }
      } catch (error) {
        console.warn(
          'Load Student Dashboard failed:',
          error
        );

        if (!cancelled) {
          setDashboardRecord(null);
          setDashboardData(createEmptyData());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStudentDashboard();

    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

  const toggleMastery = (word, skill) => {
    setSavedMessage('');

    setDashboardData((previous) => {
      const previousMastery =
        previous.sightWords?.[word];

      const normalizedMastery =
        typeof previousMastery === 'boolean'
          ? {
              read: previousMastery,
              write: false,
            }
          : {
              read: Boolean(
                previousMastery?.read
              ),
              write: Boolean(
                previousMastery?.write
              ),
            };

      return {
        ...previous,
        sightWords: {
          ...(previous.sightWords || {}),
          [word]: {
            ...normalizedMastery,
            [skill]:
              !normalizedMastery[skill],
          },
        },
      };
    });
  };

  const handleSave = async () => {
    if (!selectedStudent) return;

    setSaving(true);
    setSavedMessage('');

    try {
      const payload = {
        student_id: selectedStudent.id,
        student_number:
          selectedStudent.student_number,
        class_name:
          selectedStudent.class_name ||
          selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        language: 'es',
        dashboard_data:
          JSON.stringify(dashboardData),
      };

      if (dashboardRecord?.id) {
        const updated =
          await base44.entities.StudentDashboard.update(
            dashboardRecord.id,
            payload
          );

        setDashboardRecord(updated);
      } else {
        const created =
          await base44.entities.StudentDashboard.create(
            payload
          );

        setDashboardRecord(created);
      }

      setSavedMessage('Guardado');
    } catch (error) {
      console.error(
        'Save sight words failed:',
        error
      );

      alert(
        `No se pudo guardar: ${error.message}`
      );
    } finally {
      setSaving(false);
    }
  };

  const moveStudent = (direction) => {
    const nextIndex =
      selectedStudentIndex + direction;

    if (
      nextIndex < 0 ||
      nextIndex >= students.length
    ) {
      return;
    }

    setSelectedStudentId(
      students[nextIndex].id
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-indigo-700 text-white px-4 py-4 sm:px-6">
          <h2 className="text-xl font-black">
            Seguimiento de palabras frecuentes
          </h2>

          <p className="text-sm text-indigo-100 mt-1">
            L = Lee · E = Escribe
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">
                Clase
              </span>

              <select
                value={selectedClass}
                onChange={(event) =>
                  setSelectedClass(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800"
              >
                <option value="">
                  Seleccionar clase…
                </option>

                {spanishClasses.map((config) => (
                  <option
                    key={config.id}
                    value={config.class_name}
                  >
                    {config.class_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">
                Estudiante
              </span>

              <select
                value={selectedStudentId}
                onChange={(event) =>
                  setSelectedStudentId(
                    event.target.value
                  )
                }
                disabled={!students.length}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 disabled:opacity-50"
              >
                <option value="">
                  Seleccionar estudiante…
                </option>

                {students.map((student) => (
                  <option
                    key={student.id}
                    value={student.id}
                  >
                    #{student.student_number}{' '}
                    {student.name || ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">
              Módulo
            </p>

            <div className="flex flex-wrap gap-2">
              {MODULES.map((moduleNumber) => (
                <button
                  key={moduleNumber}
                  type="button"
                  onClick={() =>
                    setSelectedModule(
                      moduleNumber
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-sm font-black transition ${
                    selectedModule ===
                    moduleNumber
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {moduleNumber}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center font-bold text-slate-500">
              Cargando…
            </div>
          ) : !selectedStudent ? (
            <div className="py-12 text-center text-slate-500">
              Selecciona una clase y un
              estudiante.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black text-slate-800">
                      Módulo {selectedModule}
                    </p>

                    <p className="text-xs text-slate-500">
                      {selectedStudent.name ||
                        `Estudiante #${selectedStudent.student_number}`}
                    </p>
                  </div>

                  <p className="text-xs font-bold text-slate-500">
                    {moduleWords.length}{' '}
                    palabras
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {moduleWords.map((item) => {
                    const mastery =
                      dashboardData.sightWords?.[
                        item.word
                      ];

                    const canRead =
                      mastery === true ||
                      mastery?.read === true;

                    const canWrite =
                      mastery?.write === true;

                    return (
                      <div
                        key={item.key}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-lg font-black text-slate-800">
                            {item.word}
                          </p>

                          <p className="text-[11px] text-slate-400">
                            {item.curriculum_lesson_number}
                          </p>
                        </div>

                        <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={canRead}
                            onChange={() =>
                              toggleMastery(
                                item.word,
                                'read'
                              )
                            }
                            className="h-5 w-5 accent-emerald-600"
                          />
                          Lee
                        </label>

                        <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={canWrite}
                            onChange={() =>
                              toggleMastery(
                                item.word,
                                'write'
                              )
                            }
                            className="h-5 w-5 accent-blue-600"
                          />
                          Escribe
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveStudent(-1)}
                    disabled={
                      selectedStudentIndex <= 0
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
                  >
                    ← Anterior
                  </button>

                  <button
                    type="button"
                    onClick={() => moveStudent(1)}
                    disabled={
                      selectedStudentIndex < 0 ||
                      selectedStudentIndex >=
                        students.length - 1
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
                  >
                    Siguiente →
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {savedMessage && (
                    <span className="text-sm font-bold text-emerald-600">
                      {savedMessage}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving
                      ? 'Guardando…'
                      : 'Guardar'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
