import { Outlet, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

function truncateWallet(wallet = "") {
  if (!wallet || wallet.length < 10) return wallet || "Not available";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleLabel = useMemo(
    () => (user?.role ? `${user.role[0].toUpperCase()}${user.role.slice(1)}` : "User"),
    [user?.role]
  );

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen bg-healthcare-bg">
      <div className="hidden md:block">
        <Sidebar
          role={user?.role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          onLogout={handleLogout}
        />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <div className="relative z-50 h-full w-64 bg-white">
            <Sidebar
              role={user?.role}
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-sm md:hidden"
                onClick={() => setMobileOpen(true)}
              >
                Menu
              </button>
              <h1 className="text-lg font-semibold text-slate-900">Healthcare Data Console</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Wallet: {truncateWallet(user?.walletAddress)}
              </span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                Network: Sepolia
              </span>
              <StatusBadge status={roleLabel} />
            </div>
          </div>
        </header>
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
