import { Link, NavLink } from "react-router-dom";
import Button from "./Button";

export default function Sidebar({ role, collapsed, onToggle, onLogout }) {
  const baseItem =
    "block w-full rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100";
  const activeItem = "bg-healthcare-blue text-white hover:bg-healthcare-blue";

  return (
    <aside
      className={[
        "flex h-full flex-col border-r border-slate-200 bg-white p-4 transition-all duration-300",
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
        {role === "provider" ? (
          <NavLink
            to="/provider/dashboard/settings"
            className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
          >
            {collapsed ? "S" : "Settings"}
          </NavLink>
        ) : null}
      </nav>

      <div className="mt-6">
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
