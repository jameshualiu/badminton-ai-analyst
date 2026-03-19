import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "./hooks/useAuthUser";

type ProtectedRouteProps = {
  children: React.ReactElement;
  mode?: "redirect" | "unauthorized";
};

export default function ProtectedRoute({ children, mode = "redirect" }: ProtectedRouteProps) {
  const { user, loading } = useAuthUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-foreground flex items-center justify-center">
        <div className="text-muted/70">Loading...</div>
      </div>
    );
  }

  if (!user) {
    if (mode === "unauthorized") {
      return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />;
    }
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return children;
}