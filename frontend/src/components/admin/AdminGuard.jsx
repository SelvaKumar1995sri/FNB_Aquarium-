import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function AdminGuard() {
  const { isAuthenticated, isStaff, isLoading } = useAuth();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated || !isStaff) return <Navigate to="/login" replace />;

  return <Outlet />;
}
