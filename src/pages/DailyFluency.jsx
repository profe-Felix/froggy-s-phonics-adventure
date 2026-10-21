import { Navigate, useLocation } from 'react-router-dom';

// Retain old links without keeping a second, separate practice interface.
export default function DailyFluency() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.delete('daily');
  if (!params.has('role')) params.set('role', 'teacher');
  return <Navigate replace to={`/FluencyTable?${params}`} />;
}
