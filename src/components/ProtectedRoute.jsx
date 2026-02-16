import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (role && user?.role !== role) {
    const fallback = user?.role === "patient" ? "/patient/dashboard" : "/provider/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return children;
}

