import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { ConceptGraph } from "../components/ConceptGraph";
import { useAuthStore } from "../store/authStore";

export function AnalyticsPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId } = useParams<{ deckId: string }>();

  const analyticsQuery = useQuery({
    queryKey: ["analytics", deckId],
    queryFn: () => apiClient.analytics(deckId as string, token as string),
    enabled: Boolean(deckId && token),
  });

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

      <ConceptGraph graph={analytics.conceptGraph} />
    </div>
  );
}
