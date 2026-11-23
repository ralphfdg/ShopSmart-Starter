import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import StatusMessage from './StatusMessage.jsx';

// Sends guests to the sign-in page, then back here afterwards. The API still checks every request itself.
export default function RequireSignIn({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <section><StatusMessage>Checking your account…</StatusMessage></section>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
