import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "./StatusBadge";

function truncateWallet(wallet = "") {
  if (!wallet || wallet.length < 10) return wallet || "";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function Navbar({ variant = "public", onMenuClick = null, menuOpen = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function onLogout() {
    logout();
    navigate("/");
  }

  const dashboardPath = user?.role === "patient" ? "/patient/dashboard" : "/provider/dashboard";
  const isDashboard = variant === "dashboard";
  const isMenuOpen = isDashboard ? Boolean(menuOpen) : mobileOpen;

  const links = useMemo(() => {
    if (isAuthenticated) {
      return [
        { to: "/", label: "Home" },
        { to: dashboardPath, label: "Dashboard" },
        ...(user?.role === "provider"
          ? [{ to: "/provider/dashboard/settings", label: "Settings" }]
          : [])
      ];
    }

    return [{ to: "/", label: "Home" }];
  }, [dashboardPath, isAuthenticated, user?.role]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function handleMobileMenu() {
    if (typeof onMenuClick === "function") {
      onMenuClick();
      return;
    }
    setMobileOpen((value) => !value);
  }

  const baseLink =
    "rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900";
  const activeLink =
    "bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-200";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div
          className={[
            "flex items-center justify-between gap-3 px-4 py-3",
            isDashboard ? "max-w-none" : "mx-auto max-w-6xl"
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            {!isMenuOpen ? (
              <button
                type="button"
                className={[
                  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50",
                  isDashboard ? "" : "md:hidden"
                ].join(" ")}
                onClick={handleMobileMenu}
              >
                {isDashboard ? "☰" : "Menu"}
              </button>
            ) : null}
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-healthcare-blue to-healthcare-teal text-sm font-extrabold text-white shadow-sm">
                D
              </span>
              <div className="leading-tight">
                <div className="text-sm font-extrabold tracking-tight text-slate-900">DPDE</div>
                <div className="hidden text-xs text-slate-500 sm:block">
                  Decentralized Patient Data Exchange
                </div>
              </div>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `${baseLink} ${isActive ? activeLink : ""}`}
                end={link.to === "/"}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 sm:inline-flex">
                  Wallet: {truncateWallet(user?.walletAddress) || "Not available"}
                </span>
                <span className="hidden rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 sm:inline-flex">
                  Network: Sepolia
                </span>
                <StatusBadge status={user?.role || "unknown"} />
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <NavLink
                  to="/patient/login"
                  className={({ isActive }) =>
                    [
                      "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50",
                      isActive ? "ring-2 ring-healthcare-blue/20" : ""
                    ].join(" ")
                  }
                >
                  Patient
                </NavLink>
                <NavLink
                  to="/provider/login"
                  className={({ isActive }) =>
                    [
                      "rounded-xl bg-healthcare-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-700",
                      isActive ? "ring-2 ring-teal-200" : ""
                    ].join(" ")
                  }
                >
                  Provider
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </header>

      {!onMenuClick && mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <div className="absolute right-0 top-0 z-50 h-full w-80 max-w-[85vw] bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Menu</div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                onClick={() => setMobileOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    [
                      "block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100",
                      isActive ? "bg-slate-100 text-slate-900" : ""
                    ].join(" ")
                  }
                  end={link.to === "/"}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>

            {isAuthenticated ? (
              <div className="mt-6 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">Signed in as</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={user?.role || "unknown"} />
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {truncateWallet(user?.walletAddress) || "Not available"}
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="mt-6 grid gap-2">
                <NavLink
                  to="/patient/login"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 shadow-sm"
                >
                  Patient Login
                </NavLink>
                <NavLink
                  to="/provider/login"
                  className="rounded-xl bg-healthcare-teal px-4 py-2 text-center text-sm font-semibold text-white shadow-soft"
                >
                  Provider Login
                </NavLink>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
