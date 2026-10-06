import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const TEXT = {
  es: {
    title: 'Excursión — Almuerzo',
    message:
      '¡Tenemos una excursión a principios de noviembre! 🚌 Por favor, indíquenos si su hijo(a) traerá almuerzo de casa o necesitará almuerzo de la escuela. La cafetería necesita saberlo con anticipación. ¡Gracias!',
    studentName: 'Nombre del estudiante',
    studentNamePlaceholder: 'Ej: María González',
    lunchQuestion:
      '¿Su hijo(a) traerá almuerzo de casa o necesitará almuerzo de la escuela?',
    fromHome: 'Almuerzo de casa',
    fromHomeDesc: 'Mi hijo(a) traerá su almuerzo',
    schoolLunch: 'Almuerzo de la escuela',
    schoolLunchDesc: 'Mi hijo(a) necesita almuerzo de la escuela',
    submitting: 'Enviando…',
    submit: 'Enviar respuesta',
    required:
      'Por favor, ingrese el nombre del estudiante y seleccione una opción.',
    successTitle: '¡Gracias! 🎉',
    successMessage: 'Su respuesta ha sido registrada.',
    successDetail: (name, school) =>
      school
        ? `${name} recibirá almuerzo de la escuela.`
        : `${name} traerá almuerzo de casa.`,
    another: 'Enviar otra respuesta',
    error: 'Ocurrió un problema al enviar. Intente de nuevo.',
  },
  en: {
    title: 'Field Trip — Lunch',
    message:
      'We have a field trip coming up in early November! 🚌 Please let us know if your child will bring a lunch from home or need a school lunch. The cafeteria needs a count ahead of time. Thank you!',
    studentName: 'Student name',
    studentNamePlaceholder: 'e.g. Maria Gonzalez',
    lunchQuestion:
      'Will your child bring a lunch from home or need a school lunch?',
    fromHome: 'Lunch from home',
    fromHomeDesc: 'My child will bring their lunch',
    schoolLunch: 'School lunch',
    schoolLunchDesc: 'My child needs a school lunch',
    submitting: 'Submitting…',
    submit: 'Submit response',
    required:
      'Please enter the student name and select an option.',
    successTitle: 'Thank you! 🎉',
    successMessage: 'Your response has been recorded.',
    successDetail: (name, school) =>
      school
        ? `${name} will receive a school lunch.`
        : `${name} will bring lunch from home.`,
    another: 'Submit another response',
    error: 'Something went wrong submitting. Please try again.',
  },
};

export default function FieldTripLunchSignUp() {
  // Language from URL ?lang=en|es, default es
  const urlLang = useMemo(() => {
    const param = new URLSearchParams(window.location.search).get('lang');
    return param === 'en' ? 'en' : 'es';
  }, []);

  const [language, setLanguage] = useState(urlLang);
  const [studentName, setStudentName] = useState('');
  const [lunchChoice, setLunchChoice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const t = TEXT[language];

  // Keep URL lang in sync when the toggle changes so the link
  // can be shared in either language.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    sp.set('lang', language);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${sp.toString()}`
    );
  }, [language]);

  const submit = async (e) => {
    e.preventDefault();
    if (!studentName.trim() || !lunchChoice) {
      setError(t.required);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await base44.entities.FieldTripLunchResponse.create({
        student_name: studentName.trim(),
        needs_school_lunch: lunchChoice === 'school',
        language,
      });
      setDone({
        name: studentName.trim(),
        school: lunchChoice === 'school',
      });
    } catch (err) {
      setError(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setDone(null);
    setStudentName('');
    setLunchChoice(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-slate-50 flex items-start justify-center p-5">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 mt-6">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setLanguage('es')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                language === 'es'
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🇲🇽 Español
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                language === 'en'
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🇺🇸 English
            </button>
          </div>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">
              {t.successTitle}
            </h2>
            <p className="text-slate-500 mb-1">{t.successMessage}</p>
            <p className="font-bold text-slate-700 mb-6">
              {t.successDetail(done.name, done.school)}
            </p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 active:scale-95 transition"
            >
              {t.another}
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-black text-slate-800 mb-3">
              {t.title}
            </h1>
            <p className="text-slate-600 leading-relaxed mb-6 bg-amber-50 rounded-xl p-4 border border-amber-100">
              {t.message}
            </p>

            <form onSubmit={submit} className="space-y-5">
              <label className="block">
                <span className="font-bold text-slate-700">
                  {t.studentName}
                </span>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder={t.studentNamePlaceholder}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  required
                />
              </label>

              <div>
                <p className="font-bold text-slate-700 mb-3">
                  {t.lunchQuestion}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLunchChoice('home')}
                    className={`p-4 rounded-2xl border-2 text-left transition ${
                      lunchChoice === 'home'
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                        : 'border-slate-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <span className="text-2xl">🥪</span>
                    <p className="font-bold text-slate-800 mt-1">
                      {t.fromHome}
                    </p>
                    <p className="text-sm text-slate-500">{t.fromHomeDesc}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLunchChoice('school')}
                    className={`p-4 rounded-2xl border-2 text-left transition ${
                      lunchChoice === 'school'
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                        : 'border-slate-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <span className="text-2xl">🏫</span>
                    <p className="font-bold text-slate-800 mt-1">
                      {t.schoolLunch}
                    </p>
                    <p className="text-sm text-slate-500">
                      {t.schoolLunchDesc}
                    </p>
                  </button>
                </div>
              </div>

              {error && (
                <p className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-amber-500 text-white rounded-xl font-black text-lg disabled:opacity-50 active:scale-95 transition hover:bg-amber-600"
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}