import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ReviewSessionPage } from "./pages/ReviewSessionPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { apiClient } from "./api/client";
import { UserStreakStats } from "./api/types";
import { useAuthStore } from "./store/authStore";

const EMPTY_STREAK_STATS: UserStreakStats = {
  currentStreakDays: 0,
  longestStreakDays: 0,
  totalLogins: 0,
  totalActions: 0,
  lastLoginDate: null,
  lastActivityDate: null,
};

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
  const streakQuery = useQuery({
    queryKey: ["my-streak"],
    queryFn: () => apiClient.getMyStreak(token as string),
    enabled: Boolean(token),
    staleTime: 30_000,
  });

  const streakStats = token ? streakQuery.data ?? EMPTY_STREAK_STATS : EMPTY_STREAK_STATS;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-cluster">
          <span className="brand-mark">FCE</span>
          <div>
            <div className="brand">Flash Card Engine</div>
            <p className="brand-tagline">Adaptive spaced learning</p>
          </div>
        </div>
        <nav className="topbar-nav">
          <Link className="topbar-link" to="/">Dashboard</Link>
          {token && (
            <div className="streak-box" aria-live="polite">
              <span className="streak-label">Streak</span>
              <strong className="streak-value">
                {streakStats.currentStreakDays} day{streakStats.currentStreakDays === 1 ? "" : "s"}
              </strong>
              <span className="streak-meta">
                Logins {streakStats.totalLogins} | Actions {streakStats.totalActions}
              </span>
            </div>
          )}
          {token && (
            <button className="topbar-link topbar-logout" onClick={clearAuth}>
              Logout
            </button>
          )}
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
            path="/review/:deckId/:cardId"
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

      <footer className="app-footer">
        <p>Made in love with Milind Saini</p>
      </footer>
    </div>
  );
}
