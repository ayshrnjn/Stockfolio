import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SearchBar } from "./SearchBar";

export function AppLayout(): JSX.Element {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = (): void => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-5 py-3 sm:px-8 md:grid-cols-[auto_minmax(260px,520px)_auto] md:gap-x-6">
          <Link className="flex items-center gap-3" to="/" aria-label="StockFolio home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              SF
            </span>
            <span>
              <span className="block text-base font-semibold leading-none">StockFolio</span>
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Indian equities
              </span>
            </span>
          </Link>
          <div className="order-3 col-span-2 md:order-none md:col-span-1">
            <SearchBar />
          </div>
          <nav className="flex items-center gap-3" aria-label="Account navigation">
            {status === "authenticated" ? (
              <>
                <Link className="hidden text-sm font-medium text-slate-600 hover:text-ink sm:inline" to="/portfolio">
                  {user?.email}
                </Link>
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={signOut} type="button">
                  Sign out
                </button>
              </>
            ) : status === "anonymous" ? (
              <Link className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700" to="/auth">
                Sign in
              </Link>
            ) : (
              <span className="h-8 w-16 animate-pulse rounded-lg bg-slate-100" aria-label="Loading account" />
            )}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
