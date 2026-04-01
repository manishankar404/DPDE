import { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "dpde_theme";
const AUTH_STORAGE_KEY = "dpde_auth_session";
const AUTH_SESSION_EVENT = "dpde:auth-session";
const ThemeContext = createContext(null);

function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
}

function readStoredTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function hasStoredAuthSession() {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.token && parsed?.user);
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme());

  function setTheme(nextTheme) {
    const value = nextTheme === "dark" ? "dark" : "light";
    setThemeState(value);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore
    }
    applyThemeClass(value);
  }

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    function syncThemeWithAuth() {
      if (!hasStoredAuthSession()) {
        applyThemeClass("light");
        return;
      }
      const stored = readStoredTheme();
      setThemeState(stored);
      applyThemeClass(stored);
    }

    syncThemeWithAuth();

    if (typeof window === "undefined") return undefined;
    window.addEventListener(AUTH_SESSION_EVENT, syncThemeWithAuth);
    window.addEventListener("storage", syncThemeWithAuth);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, syncThemeWithAuth);
      window.removeEventListener("storage", syncThemeWithAuth);
    };
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
