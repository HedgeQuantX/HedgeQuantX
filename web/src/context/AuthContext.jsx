import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { auth, api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [propfirm, setPropfirm] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await api.get('/accounts');
      setAccounts(data.accounts || data || []);
    } catch {
      setAccounts([]);
    }
  }, []);

  const login = useCallback(async (propfirmId, username, password) => {
    setError(null);
    setLoading(true);
    try {
      const data = await auth.login(propfirmId, username, password);
      setUser(data.user || { username });
      setPropfirm(propfirmId);
      if (data.accounts) {
        setAccounts(data.accounts);
      } else {
        await fetchAccounts();
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchAccounts]);

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
    setPropfirm(null);
    setAccounts([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated()) {
      api.get('/auth/session')
        .then((data) => {
          const session = data.session || data;
          setUser(session.user || { username: session.username });
          setPropfirm(session.propfirm || null);
          return fetchAccounts();
        })
        .catch(() => {
          auth.logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchAccounts]);

  const isAuthenticated = !!user && auth.isAuthenticated();

  return (
    <AuthContext.Provider
      value={{
        user,
        propfirm,
        accounts,
        loading,
        error,
        isAuthenticated,
        login,
        logout,
        fetchAccounts,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
