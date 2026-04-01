import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  function handleLogout() {
    logout();
    navigate("/");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function openSidebarFromNavbar() {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setDesktopSidebarOpen(true);
      return;
    }
    setMobileOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-healthcare-bg dark:bg-slate-950">
      {desktopSidebarOpen ? (
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">
            <Sidebar
              user={user}
              role={user?.role}
              collapsed={false}
              onToggle={() => setDesktopSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      ) : null}

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <div className="relative z-50 h-full w-64 bg-white dark:bg-slate-950">
            <Sidebar
              user={user}
              role={user?.role}
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col">
        <Navbar
          variant="dashboard"
          menuOpen={mobileOpen || (isDesktop && desktopSidebarOpen)}
          onMenuClick={openSidebarFromNavbar}
        />
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
