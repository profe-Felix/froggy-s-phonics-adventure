import { useState, useEffect, useRef } from 'react';
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

function HalfPage({ lang, origin, qrRef }) {
  const m = MESSAGES[lang];
  return (
    <div style={{
      width: '5.5in', height: '8.5in', padding: '0.35in 0.3in',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div className="text-3xl mb-1">🚌</div>
      <h2 className="text-lg font-black text-slate-800 mb-2 text-center" style={{ fontFamily: "'Teachers', sans-serif" }}>
        {m.title}
      </h2>
      <p className="text-xs text-slate-600 leading-relaxed mb-3 text-center">
        {m.message}
      </p>
      <div ref={qrRef} className="bg-white p-2 rounded-xl shadow-sm mb-2">
        <QRCodeCanvas
          value={`${origin}/FieldTripLunch?lang=${lang}`}
          size={600}
          level="M"
          marginSize={4}
          style={{ width: 140, height: 140 }}
        />
      </div>
      <p className="text-xs font-bold text-slate-700 text-center">{m.scan}</p>
    </div>
  );
}

function FlyerContent({ origin, qrEsRef, qrEnRef }) {
  return (
    <div className="flyer-sheet" style={{
      width: '11in', height: '8.5in', display: 'flex',
      background: '#fff', boxSizing: 'border-box',
    }}>
      <div style={{ borderRight: '2px dashed #94a3b8' }}>
        <HalfPage lang="es" origin={origin} qrRef={qrEsRef} />
      </div>
      <HalfPage lang="en" origin={origin} qrRef={qrEnRef} />
    </div>
  );
}

export default function FieldTripLunchFlyer() {
  const qrEsRef = useRef(null);
  const qrEnRef = useRef(null);
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

      {/* Flyer preview — landscape sheet with 2 portrait half-pages */}
      <main className="flex justify-center py-6 overflow-x-auto">
        <div className="printable shadow-2xl">
          <FlyerContent origin={origin} qrEsRef={qrEsRef} qrEnRef={qrEnRef} />
        </div>
      </main>
    </div>
  );
}