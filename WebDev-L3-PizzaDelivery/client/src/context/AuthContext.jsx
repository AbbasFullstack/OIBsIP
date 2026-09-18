import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api/axios.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const persist = useCallback((nextToken, nextUser) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);
    setToken(nextToken || null);
    setUser(nextUser || null);
  }, []);

  const logout = useCallback(() => persist(null, null), [persist]);

  // Rehydrate the session from a stored token on first load.
  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return undefined;
    }
    api
      .get('/auth/me')
      .then(({ data }) => active && setUser(data.user))
      .catch(() => active && persist(null, null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, persist]);

  // The axios interceptor emits this when the server rejects our token.
  useEffect(() => {
    const onUnauthorized = () => persist(null, null);
    window.addEventListener('slice:unauthorized', onUnauthorized);
    return () => window.removeEventListener('slice:unauthorized', onUnauthorized);
  }, [persist]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      persist(data.token, data.user);
      return data.user;
    },
    [persist],
  );

  const adminLogin = useCallback(
    async (email, password) => {
      const { data } = await api.post('/admin/auth/login', { email, password });
      persist(data.token, data.user);
      return data.user;
    },
    [persist],
  );

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      isAdmin: user?.role === 'admin',
      login,
      adminLogin,
      register,
      logout,
      setUser,
    }),
    [user, token, loading, login, adminLogin, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}