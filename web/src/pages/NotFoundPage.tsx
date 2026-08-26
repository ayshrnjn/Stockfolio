import { Link } from "react-router-dom";

export function NotFoundPage(): JSX.Element {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-xl place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Page not found</h1>
        <p className="mt-3 text-slate-600">The page you requested does not exist.</p>
        <Link className="mt-7 inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700" to="/">
          Return home
        </Link>
      </div>
    </main>
  );
}

