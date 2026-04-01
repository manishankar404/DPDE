import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

const DashboardLayout = lazy(() => import("./layout/DashboardLayout"));
const MainLayout = lazy(() => import("./layout/MainLayout"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PatientAuditLogs = lazy(() => import("./pages/PatientAuditLogs"));
const PatientNotifications = lazy(() => import("./pages/PatientNotifications"));
const PatientProfile = lazy(() => import("./pages/PatientProfile"));
const PatientSettings = lazy(() => import("./pages/PatientSettings"));
const PatientRegister = lazy(() => import("./pages/PatientRegister"));
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"));
const ProviderProfile = lazy(() => import("./pages/ProviderProfile"));
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
              path="/login"
              element={
                <GuestOnlyRoute>
                  <Login />
                </GuestOnlyRoute>
              }
            />
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
                  <Login />
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
                  <Login />
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
            <Route path="audit" element={<PatientAuditLogs />} />
            <Route path="notifications" element={<PatientNotifications />} />
            <Route path="profile" element={<PatientProfile />} />
            <Route path="settings" element={<PatientSettings />} />
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
            <Route path="profile" element={<ProviderProfile />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}


