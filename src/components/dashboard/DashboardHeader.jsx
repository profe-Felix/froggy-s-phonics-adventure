import React from 'react';
import { WESTWOOD_LOGO_URL } from '@/lib/westwoodLogo';

// Header: logo (left) + BIG centered title (Happy Monkey font) ABOVE the cells.
// Then a bordered info row with wider Name cell, narrower ID/Grado.
export function DashboardHeader({ student, lang, class_name }) {
  return (
    <div>
      {/* Title block — above the cells, not inside a border */}
      <div className="flex items-center justify-center relative py-3">
        <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-20 h-20 object-contain absolute left-2 top-1/2 -translate-y-1/2" />
        <div className="text-center">
          <h1 className="font-bold leading-tight" style={{ fontFamily: '"Happy Monkey", cursive', fontSize: '26px' }}>WESTWOOD ELEMENTARY</h1>
          <p className="font-bold leading-tight mt-0.5" style={{ fontFamily: '"Happy Monkey", cursive', fontSize: '14px' }}>FORMULARIO DE INFORMACIÓN DEL ESTUDIANTE</p>
        </div>
      </div>
      {/* Info row — bordered cells, Name gets more space */}
      <div className="border-2 border-black grid grid-cols-[3fr_1fr_1.5fr_0.7fr] text-sm">
        <div className="border-r-2 border-black px-2 py-1">
          <span className="font-bold">Nombre:</span> {student?.name || '—'}
        </div>
        <div className="border-r-2 border-black px-2 py-1">
          <span className="font-bold">ID:</span> {student?.barcode_number || '—'}
        </div>
        <div className="border-r-2 border-black px-2 py-1">
          <span className="font-bold">Maestro(a):</span> {class_name || '—'}
        </div>
        <div className="px-2 py-1">
          <span className="font-bold">Grado:</span> {student?.grade || 'K'}
        </div>
      </div>
    </div>
  );
}

// Compact print header (same layout)
export function PrintHeader({ student, lang, class_name }) {
  return <DashboardHeader student={student} lang={lang} class_name={class_name} />;
}

export default DashboardHeader;