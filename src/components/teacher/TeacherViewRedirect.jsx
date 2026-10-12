import { Navigate } from 'react-router-dom';

// Wraps the home route: /?role=teacher bounces to /TeacherView (carrying
// ?class=), everything else renders the normal student home.
export default function TeacherViewRedirect({ children }) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('role') === 'teacher') {
    const cls = params.get('class');
    const search = cls ? `?class=${encodeURIComponent(cls)}` : '';
    return <Navigate to={`/TeacherView${search}`} replace />;
  }
  return children;
}