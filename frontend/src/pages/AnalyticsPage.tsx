import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "../api/client";
import { ConceptGraph } from "../components/ConceptGraph";
import { Heatmap } from "../components/Heatmap";
import { useAuthStore } from "../store/authStore";

export function AnalyticsPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId } = useParams<{ deckId: string }>();

  const analyticsQuery = useQuery({
    queryKey: ["analytics", deckId],
    queryFn: () => apiClient.analytics(deckId as string, token as string),
    enabled: Boolean(deckId && token),
  });

  const relationQuery = useQuery({
    queryKey: ["relation-card", deckId],
    queryFn: () => apiClient.search("relationship map", "semantic", token as string, deckId),
    enabled: Boolean(deckId && token),
  });

  const decayData = useMemo(() => {
    if (!analyticsQuery.data) {
      return [];
    }
    return analyticsQuery.data.decayCurve.map((point) => ({
      day: point.day,
      retention: Math.round(point.retention * 100),
    }));
  }, [analyticsQuery.data]);

  if (analyticsQuery.isLoading) {
    return <section className="surface">Loading analytics...</section>;
  }

  if (analyticsQuery.isError) {
    return <section className="surface">{(analyticsQuery.error as Error).message}</section>;
  }

  const analytics = analyticsQuery.data;
  if (!analytics) {
    return <section className="surface">Analytics data is not available yet.</section>;
  }

  const relationCard = relationQuery.data?.results.find((result) => result.type === "RELATION");

  return (
    <div className="grid">
      <section className="surface">
        <h1>Mastery Analytics</h1>
        <div className="row">
          <p>Mastered: {analytics.masteredCards}</p>
          <p>Shaky: {analytics.shakyCards}</p>
          <p>Due today: {analytics.dueToday}</p>
        </div>
        <Link className="button-main" to={`/review/${deckId}`}>
          Return to Review
        </Link>
      </section>

      <section className="surface">
        <h3>Ebbinghaus Decay Curve</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={decayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#c9d7e2" />
              <XAxis dataKey="day" stroke="#264455" />
              <YAxis stroke="#264455" domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="retention" stroke="#ff5e2c" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface">
        <h3>Review Streak Heatmap</h3>
        <Heatmap data={analytics.heatmap} />
      </section>

      <ConceptGraph graphJson={relationCard?.back} />
    </div>
  );
}
