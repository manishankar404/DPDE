import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "dpde_auth_session";
const UNAUTHORIZED_EVENT = "dpde:unauthorized";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.user) setUser(parsed.user);
      if (parsed?.token) setToken(parsed.token);
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      setToken(null);
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
    }

    if (typeof window === "undefined") return;
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  function login(userData, sessionToken = null) {
    setUser(userData);
    setToken(sessionToken);
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user: userData, token: sessionToken })
    );
  }

  function updateUser(updates) {
    setUser((prev) => {
      const next = { ...(prev || {}), ...(updates || {}) };
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user: next, token })
      );
      return next;
    });
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      updateUser,
      logout,
      isAuthenticated: Boolean(user)
    }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
