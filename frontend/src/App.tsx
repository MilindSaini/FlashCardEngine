import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ReviewSessionPage } from "./pages/ReviewSessionPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { useAuthStore } from "./store/authStore";

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((state) => state.token);
  if (!token) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

export default function App() {
  const token = useAuthStore((state) => state.token);
  const clearAuth = useAuthStore((state) => state.clear);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">FLASHCORE</div>
        <nav>
          <Link to="/">Dashboard</Link>
          {token && <button onClick={clearAuth}>Logout</button>}
        </nav>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/review/:deckId"
            element={
              <Protected>
                <ReviewSessionPage />
              </Protected>
            }
          />
          <Route
            path="/analytics/:deckId"
            element={
              <Protected>
                <AnalyticsPage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to={token ? "/" : "/auth"} replace />} />
        </Routes>
      </main>
    </div>
  );
}
