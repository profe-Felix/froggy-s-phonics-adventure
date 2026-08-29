import { useClassNames } from '@/hooks/useClassNames';

// Shared dropdown of class names, driven by ClassConfig records so new classes
// appear automatically. Use anywhere a dashboard used to hardcode
// `['Felix','Valero','Campos']`.
//
// Props:
//   value, onChange(class), includeAll (bool) — adds an "All classes" option
//   whose value is "" (empty string).
export default function ClassSelect({ value, onChange, includeAll = false, className = '' }) {
  const { classList } = useClassNames();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {includeAll && <option value="">All classes</option>}
      {classList.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}