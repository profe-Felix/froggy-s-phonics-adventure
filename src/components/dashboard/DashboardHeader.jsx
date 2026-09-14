import React from 'react';
import { WESTWOOD_LOGO_URL } from '@/lib/westwoodLogo';

// 3-tier header matching the reference: logo (left) + centered title, then bordered info row.
export function DashboardHeader({ student, lang, class_name }) {
  return (
    <div className="border-2 border-black">
      {/* Tier 1: Logo + centered title */}
      <div className="flex items-center justify-center relative py-2 border-b-2 border-black">
        <img src={WESTWOOD_LOGO_URL} alt="Westwood Elementary" className="w-16 h-16 object-contain absolute left-2 top-1/2 -translate-y-1/2" />
        <div className="text-center">
          <h1 className="text-lg font-black leading-tight">WESTWOOD ELEMENTARY</h1>
          <p className="text-sm font-bold leading-tight">FORMULARIO DE INFORMACIÓN DEL ESTUDIANTE</p>
        </div>
      </div>
      {/* Tier 2: Info row */}
      <div className="grid grid-cols-4 text-sm">
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

// Compact print header (same 3-tier layout, smaller)
export function PrintHeader({ student, lang, class_name }) {
  return <DashboardHeader student={student} lang={lang} class_name={class_name} />;
}

export default DashboardHeader;