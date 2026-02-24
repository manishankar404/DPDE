import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

const DashboardLayout = lazy(() => import("./layout/DashboardLayout"));
const MainLayout = lazy(() => import("./layout/MainLayout"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PatientLogin = lazy(() => import("./pages/PatientLogin"));
const PatientRegister = lazy(() => import("./pages/PatientRegister"));
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"));
const ProviderLogin = lazy(() => import("./pages/ProviderLogin"));
const ProviderRegister = lazy(() => import("./pages/ProviderRegister"));
const ProviderSettings = lazy(() => import("./pages/ProviderSettings"));

function GuestOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return children;
  return (
    <Navigate
      replace
      to={user?.role === "patient" ? "/patient/dashboard" : "/provider/dashboard"}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-slate-600">Loading page...</p>
          </div>
        }
      >
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route
              path="/patient/register"
              element={
                <GuestOnlyRoute>
                  <PatientRegister />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/patient/login"
              element={
                <GuestOnlyRoute>
                  <PatientLogin />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/provider/register"
              element={
                <GuestOnlyRoute>
                  <ProviderRegister />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/provider/login"
              element={
                <GuestOnlyRoute>
                  <ProviderLogin />
                </GuestOnlyRoute>
              }
            />
          </Route>

          <Route
            path="/patient/dashboard"
            element={
              <ProtectedRoute role="patient">
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientDashboard />} />
          </Route>

          <Route
            path="/provider/dashboard"
            element={
              <ProtectedRoute role="provider">
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ProviderDashboard />} />
            <Route path="settings" element={<ProviderSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
