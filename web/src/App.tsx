import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

const StockDetailPage = lazy(async () => {
  const module = await import("./pages/StockDetailPage");
  return { default: module.StockDetailPage };
});
const PortfolioPage = lazy(async () => {
  const module = await import("./pages/PortfolioPage");
  return { default: module.PortfolioPage };
});

const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/auth", element: <AuthPage /> },
        {
          path: "/stock/:exchange/:symbol",
          element: (
            <Suspense fallback={<div className="mx-auto mt-10 h-64 max-w-7xl animate-pulse rounded-3xl bg-white shadow-panel" />}>
              <StockDetailPage />
            </Suspense>
          ),
        },
        {
          element: <ProtectedRoute />,
          children: [
            {
              path: "/portfolio",
              element: (
                <Suspense fallback={<div className="mx-auto mt-10 h-64 max-w-7xl animate-pulse rounded-3xl bg-white shadow-panel" />}>
                  <PortfolioPage />
                </Suspense>
              ),
            },
          ],
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
);

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
