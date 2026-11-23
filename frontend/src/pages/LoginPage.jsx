import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from;
  const returnTo = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/orders';
  if (user) return <Navigate to={returnTo} replace />;

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(form.email, form.password);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-layout">
      <form onSubmit={submit}>
        <div>
          <p className="eyebrow">CUSTOMER ACCOUNT</p>
          <h1>Sign in</h1>
          <p>Use a fictional test account. Never enter a real password here.</p>
        </div>
        <StatusMessage type="error">{error}</StatusMessage>
        <label>Email address<input name="email" type="email" autoComplete="username" value={form.email} onChange={updateField} required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" value={form.password} onChange={updateField} required /></label>
        <button disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  );
}
