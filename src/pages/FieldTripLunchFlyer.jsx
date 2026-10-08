import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, Table, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const MESSAGES = {
  es: {
    title: 'Excursión — Almuerzo',
    message:
      '¡Tenemos una excursión a principios de noviembre! 🚌 Por favor, indíquenos si su hijo(a) traerá almuerzo de casa o necesitará almuerzo de la escuela. La cafetería necesita saberlo con anticipación. ¡Gracias!',
    scan: 'Escanee el código QR para completar el formulario',
  },
  en: {
    title: 'Field Trip — Lunch',
    message:
      'We have a field trip coming up in early November! 🚌 Please let us know if your child will bring a lunch from home or need a school lunch. The cafeteria needs a count ahead of time. Thank you!',
    scan: 'Scan the QR code to fill out the form',
  },
};

function HalfPage({ lang, origin }) {
  const m = MESSAGES[lang];
  return (
    <div style={{
      width: '5.5in', height: '8.5in', padding: '0.4in 0.35in',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: '2.2rem', marginBottom: '0.15in' }}>🚌</div>
      <h2 style={{
        fontFamily: "'Teachers', sans-serif",
        fontSize: '1.4rem', fontWeight: 800, color: '#1e293b',
        marginBottom: '0.2in', textAlign: 'center',
      }}>
        {m.title}
      </h2>
      <p style={{
        fontSize: '0.95rem', lineHeight: 1.5, color: '#475569',
        marginBottom: '0.25in', textAlign: 'center', maxWidth: '4.5in',
      }}>
        {m.message}
      </p>
      <div style={{
        background: '#fff', padding: '0.12in', borderRadius: '0.15in',
        marginBottom: '0.2in',
      }}>
        <QRCodeCanvas
          value={`${origin}/FieldTripLunch?lang=${lang}`}
          size={600}
          level="M"
          marginSize={4}
          style={{ width: 170, height: 170 }}
        />
      </div>
      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', textAlign: 'center' }}>
        {m.scan}
      </p>
    </div>
  );
}

function FlyerPage({ lang, origin }) {
  return (
    <div className="flyer-sheet" style={{
      width: '11in', height: '8.5in', display: 'flex',
      background: '#fff', boxSizing: 'border-box',
    }}>
      <div style={{ borderRight: '2px dashed #94a3b8' }}>
        <HalfPage lang={lang} origin={origin} />
      </div>
      <HalfPage lang={lang} origin={origin} />
    </div>
  );
}

export default function FieldTripLunchFlyer() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const origin = window.location.origin;

  useEffect(() => {
    base44.entities.FieldTripLunchSheetSetting.list('-created_date', 1)
      .then((settings) => {
        if (settings.length && settings[0].spreadsheet_id) {
          setSheetUrl(`https://docs.google.com/spreadsheets/d/${settings[0].spreadsheet_id}/edit`);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createSheet = async () => {
    setCreating(true);
    try {
      const res = await base44.functions.invoke('createFieldTripLunchSheet', {});
      const data = res.data || res;
      if (data.url) setSheetUrl(data.url);
    } catch (err) {
      alert('Could not create sheet. Make sure you are logged in as a teacher.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden in print */}
      <header className="bg-white border-b sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-bold text-gray-800">🚌 Lunch Form Flyer</h1>
          <span className="text-xs text-slate-400 ml-2">Front: Spanish · Back: English · Double-sided</span>
          <div className="flex-1" />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          {sheetUrl ? (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700"
            >
              <Table className="w-4 h-4" /> Open Sheet
            </a>
          ) : (
            <button
              onClick={createSheet}
              disabled={creating || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table className="w-4 h-4" />}
              {creating ? 'Creating…' : 'Create Google Sheet'}
            </button>
          )}
        </div>
      </header>

      {/* Flyer preview — portrait, two pages for double-sided printing */}
      <main className="flex flex-col items-center gap-6 py-6 overflow-x-auto print:gap-0 print:py-0">
        <div className="no-print text-xs font-bold text-slate-400 uppercase tracking-wide">Front — Spanish</div>
        <div className="printable flyer-printable shadow-2xl">
          <FlyerPage lang="es" origin={origin} />
        </div>
        <div className="no-print text-xs font-bold text-slate-400 uppercase tracking-wide">Back — English</div>
        <div className="printable flyer-printable shadow-2xl">
          <FlyerPage lang="en" origin={origin} />
        </div>
      </main>
    </div>
  );
}