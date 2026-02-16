import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const dashboardPath =
    user?.role === "patient" ? "/patient/dashboard" : "/provider/dashboard";

  function onLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-healthcare-blue">
          DPDE
        </Link>
        <nav className="flex items-center gap-2">
          <Link className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" to="/">
            Home
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                to={dashboardPath}
              >
                Dashboard
              </Link>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={onLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                to="/patient/login"
              >
                Patient Login
              </Link>
              <Link
                className="hidden rounded-xl bg-healthcare-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 sm:inline-block"
                to="/provider/login"
              >
                Provider Login
              </Link>
              <Link
                className="sm:hidden rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                to="/provider/login"
              >
                Provider
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
