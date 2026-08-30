import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import TracingLetterToggle from '@/components/tracing/TracingLetterToggle';

// Standalone page for the Letter Tracing progression — which letters/numbers
// are enabled for free play, per class. Separated from the authoring page
// (drawing the strokes) since the progression changes often but the stroke
// data rarely does.
export default function LetterTracingProgression() {
  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">✏️ Letter Tracing Progression</h1>
            <p className="text-sm text-slate-500">Toggle which letters and numbers are enabled for free play. Each class can have its own progression.</p>
          </div>
          <Link
            to="/LetterTracingAuthoring"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Pencil className="w-4 h-4" /> Author strokes
          </Link>
        </div>

        <TracingLetterToggle />
      </div>
    </div>
  );
}