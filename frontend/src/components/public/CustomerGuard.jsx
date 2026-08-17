import { Navigate, Outlet } from "react-router-dom";

import { useCustomerAuth } from "../../context/CustomerAuthContext";

export default function CustomerGuard() {
  const { isAuthenticated, isLoading } = useCustomerAuth();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
}
