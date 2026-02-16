import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { auth, api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [propfirm, setPropfirm] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [initializing, setInitializing] = useState(true); // Only for initial session check
  const [loginLoading, setLoginLoading] = useState(false);
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
    setLoginLoading(true);
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
      setLoginLoading(false);
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
    if (!auth.isAuthenticated()) {
      setInitializing(false);
      return;
    }

    // Restore session on mount.
    // If backend session expired, the request() layer auto-reconnects
    // using encrypted credentials before returning the response.
    api.get('/auth/session')
      .then((data) => {
        const session = data.session || data;
        setUser(session.user || { username: session.username });
        setPropfirm(session.propfirm || null);
        if (session.accounts?.length) {
          setAccounts(session.accounts);
        } else {
          return fetchAccounts();
        }
      })
      .catch(() => {
        // Reconnect also failed — clear everything
        auth.logout();
      })
      .finally(() => setInitializing(false));
  }, [fetchAccounts]);

  const isAuthenticated = !!user && auth.isAuthenticated();

  return (
    <AuthContext.Provider
      value={{
        user,
        propfirm,
        accounts,
        loading: initializing,
        loginLoading,
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
