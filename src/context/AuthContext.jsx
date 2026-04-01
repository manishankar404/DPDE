import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "dpde_auth_session";
const UNAUTHORIZED_EVENT = "dpde:unauthorized";
const AUTH_SESSION_EVENT = "dpde:auth-session";

const AuthContext = createContext(null);

function readStoredSession() {
  if (typeof window === "undefined") {
    return { user: null, token: null };
  }
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    return { user: parsed?.user || null, token: parsed?.token || null };
  } catch {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    return { user: null, token: null };
  }
}

function emitAuthSessionChange() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT));
    }
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredSession().user);
  const [token, setToken] = useState(() => readStoredSession().token);

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      setToken(null);
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      emitAuthSessionChange();
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
    emitAuthSessionChange();
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
    emitAuthSessionChange();
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    emitAuthSessionChange();
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
