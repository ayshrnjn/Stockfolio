import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-6">
        <div className="flex items-center gap-3 text-sm text-slate-600" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
          Restoring your session
        </div>
      </main>
    );
  }

  if (status === "anonymous") {
    return <Navigate replace to="/auth" state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
