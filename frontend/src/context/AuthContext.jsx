import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // The session lives in an HttpOnly cookie, so the server is asked who is signed in.
  useEffect(() => {
    let active = true;
    api.getSession()
      .then((data) => active && setUser(data.user))
      .catch(() => {})
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const data = await api.signIn(email, password);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, checking, signIn, signOut }), [user, checking, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
