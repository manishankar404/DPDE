import { Link, NavLink } from "react-router-dom";
import Button from "./Button";
import StatusBadge from "./StatusBadge";

function truncateWallet(wallet = "") {
  const value = String(wallet || "");
  if (!value || value.length < 10) return value || "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function Sidebar({ user, role, collapsed, onToggle, onLogout }) {
  const baseItem =
    "block w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 " +
    "dark:text-slate-200 dark:hover:bg-slate-900/60 dark:hover:text-slate-100";
  const activeItem = "bg-healthcare-blue text-white hover:bg-healthcare-blue";

  return (
    <aside
      className={[
        "flex h-full flex-col border-r border-slate-200 bg-white p-4 transition-all duration-300",
        "dark:border-slate-800 dark:bg-slate-950",
        collapsed ? "w-16" : "w-64"
      ].join(" ")}
    >
      <div className="mb-6 flex items-center justify-between">
        {!collapsed ? (
          <Link to="/" className="text-lg font-bold text-healthcare-blue">
            DPDE
          </Link>
        ) : (
          <span className="text-lg font-bold text-healthcare-blue">D</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
        >
          {collapsed ? ">" : "<"}
        </button>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto">
        <NavLink
          to={role === "patient" ? "/patient/dashboard/profile" : "/provider/dashboard/profile"}
          className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
        >
          {collapsed ? "P" : "Profile"}
        </NavLink>
        <NavLink
          to={role === "patient" ? "/patient/dashboard/settings" : "/provider/dashboard/settings"}
          className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
        >
          {collapsed ? "S" : "Settings"}
        </NavLink>
        <NavLink
          to={role === "patient" ? "/patient/dashboard" : "/provider/dashboard"}
          className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
        >
          {collapsed ? "D" : "Dashboard"}
        </NavLink>
        {role === "patient" ? (
          <>
            <NavLink
              to="/patient/dashboard/audit"
              className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
            >
              {collapsed ? "A" : "Audit Logs"}
            </NavLink>
            <NavLink
              to="/patient/dashboard/notifications"
              className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
            >
              {collapsed ? "N" : "Notifications"}
            </NavLink>
          </>
        ) : null}
      </nav>

      <div className="mt-6">
        {!collapsed ? (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Signed in as</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={role || "unknown"} />
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                Network: Sepolia
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Wallet</div>
            <div className="mt-1 font-mono text-sm text-slate-700 dark:text-slate-200">
              {truncateWallet(user?.walletAddress) || "—"}
            </div>
          </div>
        ) : null}

        <Button
          variant="ghost"
          type="button"
          className={collapsed ? "w-full px-2" : "w-full"}
          onClick={onLogout}
        >
          {collapsed ? "Out" : "Logout"}
        </Button>
      </div>
    </aside>
  );
}
