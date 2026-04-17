import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiClient } from "../api/client";
import { ConceptGraph } from "../components/ConceptGraph";
import { useAuthStore } from "../store/authStore";
import { isValidUuid } from "../types/validation";

export function AnalyticsPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId } = useParams<{ deckId: string }>();
  const hasValidDeckId = isValidUuid(deckId);

  const analyticsQuery = useQuery({
    queryKey: ["analytics", deckId],
    queryFn: () => apiClient.analytics(deckId as string, token as string),
    enabled: Boolean(deckId && token && hasValidDeckId),
  });

  useEffect(() => {
    if (deckId && !hasValidDeckId) {
      toast.error("Invalid analytics link. Open the deck from dashboard.", { id: "invalid-analytics-deck" });
    }
  }, [deckId, hasValidDeckId]);

  if (deckId && !hasValidDeckId) {
    return <section className="surface analytics-state analytics-state-error">Invalid deck link. Please return to dashboard.</section>;
  }

  useEffect(() => {
    if (analyticsQuery.isError) {
      toast.error("Analytics could not be loaded right now. Please try again.", { id: "analytics-load-error" });
    }
  }, [analyticsQuery.isError]);

  if (analyticsQuery.isLoading) {
    return <section className="surface analytics-state">Loading analytics...</section>;
  }

  if (analyticsQuery.isError) {
    return <section className="surface analytics-state analytics-state-error">Analytics is temporarily unavailable. Please retry.</section>;
  }

  const analytics = analyticsQuery.data;
  if (!analytics) {
    return <section className="surface analytics-state">Analytics data is not available yet.</section>;
  }

  return (
    <div className="grid analytics-page">
      <section className="surface analytics-hero">
        <p className="analytics-kicker">Deck Intelligence</p>
        <h1>Mastery Analytics</h1>
        <p className="analytics-lead">
          Read the strength of your memory network and prioritize where the next study effort should go.
        </p>

        <div className="analytics-kpi-grid" role="list" aria-label="Deck analytics snapshot">
          <article className="analytics-kpi-card mastered" role="listitem">
            <span className="analytics-kpi-label">Mastered</span>
            <strong>{analytics.masteredCards}</strong>
          </article>
          <article className="analytics-kpi-card shaky" role="listitem">
            <span className="analytics-kpi-label">Shaky</span>
            <strong>{analytics.shakyCards}</strong>
          </article>
          <article className="analytics-kpi-card upcoming" role="listitem">
            <span className="analytics-kpi-label">Due Today</span>
            <strong>{analytics.dueToday}</strong>
          </article>
        </div>

        <div className="row analytics-actions">
          <Link className="button-main" to={`/review/${deckId}`}>
            Return to Review
          </Link>
          <Link className="button-alt" to="/">
            Dashboard
          </Link>
        </div>
      </section>

      <section className="analytics-graph-wrap">
        <ConceptGraph graph={analytics.conceptGraph} />
      </section>
    </div>
  );
}
