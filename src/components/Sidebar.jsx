import { Link, NavLink } from "react-router-dom";
import Button from "./Button";

export default function Sidebar({ role, collapsed, onToggle, onLogout }) {
  const baseItem =
    "rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100";
  const activeItem = "bg-healthcare-blue text-white hover:bg-healthcare-blue";

  return (
    <aside
      className={[
        "border-r border-slate-200 bg-white p-4 transition-all duration-300",
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

      <nav className="space-y-2">
        <NavLink
          to={role === "patient" ? "/patient/dashboard" : "/provider/dashboard"}
          className={({ isActive }) => `${baseItem} ${isActive ? activeItem : ""}`}
        >
          {collapsed ? "D" : "Dashboard"}
        </NavLink>
        {role === "patient" ? (
          <span className={baseItem}>{collapsed ? "U" : "Upload"}</span>
        ) : null}
        <span className={baseItem}>{collapsed ? "R" : "Requests"}</span>
      </nav>

      <div className="mt-8">
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

