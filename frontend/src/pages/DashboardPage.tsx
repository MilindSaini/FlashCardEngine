import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiClient } from "../api/client";
import { DeckSummary } from "../api/types";
import { useAuthStore } from "../store/authStore";
import { useStreakStore } from "../store/streakStore";
import {
  isValidUuid,
  normalizeDeckTitle,
  normalizeSearchQuery,
  validateDeckTitle,
  validatePdfFile,
  validateSearchQuery,
} from "../types/validation";

function deckFocusMessage(deck: DeckSummary) {
  if (deck.totalCards === 0) {
    return "Upload notes to generate cards and start your first learning streak.";
  }

  if (deck.dueToday === 0 && deck.shakyCards === 0) {
    return "Great stability. Keep it warm with a short confidence review tomorrow.";
  }

  if (deck.shakyCards > deck.dueToday) {
    return `Focus on ${deck.shakyCards} shaky cards first to protect your long-term retention.`;
  }

  if (deck.dueToday > 0) {
    return `${deck.dueToday} cards are coming up now. A quick session will keep momentum high.`;
  }

  return "Steady progress. Keep the rhythm with one focused review block.";
}

function overallMomentumMessage(mastered: number, shaky: number, dueToday: number) {
  if (mastered === 0 && shaky === 0 && dueToday === 0) {
    return "Create your first deck to begin tracking mastery and review momentum.";
  }

  if (dueToday === 0 && shaky === 0) {
    return "You are in a strong zone. Everything looks stable right now.";
  }

  if (shaky > dueToday) {
    return `Prioritize shaky cards (${shaky}) first, then clear what's due (${dueToday}).`;
  }

  return `You have ${dueToday} upcoming reviews. One focused sprint is enough to stay on track.`;
}

function nextReviewDateLabel(nextReviewDate: string | null) {
  if (!nextReviewDate) {
    return "No review scheduled";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextDate = new Date(`${nextReviewDate}T00:00:00`);
  if (Number.isNaN(nextDate.getTime())) {
    return nextReviewDate;
  }

  const dayDiff = Math.round((nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) {
    return "Today";
  }

  if (dayDiff === 1) {
    return "Tomorrow";
  }

  return nextDate.toLocaleDateString();
}

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.userId);
  const registerActivity = useStreakStore((state) => state.registerActivity);
  const [title, setTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"fulltext" | "semantic">("fulltext");
  const queryClient = useQueryClient();
  const normalizedSearchQuery = useMemo(() => normalizeSearchQuery(searchQuery), [searchQuery]);
  const searchValidationError = useMemo(
    () => validateSearchQuery(normalizedSearchQuery),
    [normalizedSearchQuery]
  );

  const decksQuery = useQuery({
    queryKey: ["decks"],
    queryFn: () => apiClient.listDecks(token as string),
    enabled: Boolean(token),
  });

  const createDeckMutation = useMutation({
    mutationFn: (normalizedTitle: string) => apiClient.createDeck(normalizedTitle, token as string),
    onSuccess: () => {
      if (userId) {
        registerActivity(userId);
      }
      toast.success("Deck created successfully.");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
    onError: () => {
      toast.error("Could not create the deck right now. Please try again.", { id: "create-deck-error" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) =>
      apiClient.uploadPdf(deckId, file, token as string),
    onSuccess: () => {
      if (userId) {
        registerActivity(userId);
      }
      toast.success("Upload accepted. Card generation has started.");
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
    onError: () => {
      toast.error("Upload failed. Please try another file or retry.", { id: "upload-error" });
    },
  });

  const searchQueryResult = useQuery({
    queryKey: ["deck-search", normalizedSearchQuery, searchMode],
    queryFn: () => apiClient.search(normalizedSearchQuery, searchMode, token as string),
    enabled: Boolean(token) && !searchValidationError && normalizedSearchQuery.trim().length >= 2,
  });

  useEffect(() => {
    if (decksQuery.isError) {
      toast.error("Could not load your decks. Please refresh and try again.", { id: "decks-load-error" });
    }
  }, [decksQuery.isError]);

  useEffect(() => {
    if (searchQueryResult.isError && normalizedSearchQuery.trim().length >= 2) {
      toast.error("Search is unavailable right now. Please try again shortly.", { id: "search-error" });
    }
  }, [normalizedSearchQuery, searchQueryResult.isError]);

  const decks = decksQuery.data ?? [];

  const onCreateDeck = () => {
    const normalizedTitle = normalizeDeckTitle(title);
    const titleError = validateDeckTitle(normalizedTitle);
    if (titleError) {
      toast.error(titleError, { id: "deck-title-validation" });
      return;
    }

    createDeckMutation.mutate(normalizedTitle);
  };

  const onFilePick = (deckId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isValidUuid(deckId)) {
      toast.error("Invalid deck reference. Please refresh and try again.", { id: "deck-id-validation" });
      return;
    }

    const fileError = validatePdfFile(file);
    if (fileError) {
      toast.error(fileError, { id: "upload-validation" });
      return;
    }

    uploadMutation.mutate({ deckId, file });
  };

  const onResumeDeck = (deckId: string) => {
    if (!isValidUuid(deckId)) {
      toast.error("This deck link is invalid. Please refresh the dashboard.", { id: "resume-deck-validation" });
      return;
    }

    queryClient.removeQueries({ queryKey: ["deck-session", deckId] });
    queryClient.removeQueries({ queryKey: ["due-cards", deckId] });
    queryClient.removeQueries({ queryKey: ["deck-cards", deckId] });
  };

  const deckCountLabel = useMemo(() => `${decks.length} deck${decks.length === 1 ? "" : "s"}`, [decks.length]);

  const overallSnapshot = useMemo(() => {
    return decks.reduce(
      (accumulator, deck) => {
        accumulator.mastered += deck.masteredCards;
        accumulator.shaky += deck.shakyCards;
        accumulator.upcoming += deck.dueToday;
        accumulator.total += deck.totalCards;
        return accumulator;
      },
      { mastered: 0, shaky: 0, upcoming: 0, total: 0 }
    );
  }, [decks]);

  const overallMastery = overallSnapshot.total > 0
    ? (overallSnapshot.mastered / overallSnapshot.total) * 100
    : 0;

  const overallMessage = overallMomentumMessage(
    overallSnapshot.mastered,
    overallSnapshot.shaky,
    overallSnapshot.upcoming
  );

  const dashboardErrorText = createDeckMutation.isError
    ? "Could not create the deck. Please try again."
    : uploadMutation.isError
      ? "Upload could not be completed. Please retry."
      : decksQuery.isError
        ? "Dashboard data could not be loaded. Please refresh."
        : null;

  return (
    <div className="grid">
      <section className="surface dashboard-hero">
        <h1>Learning Dashboard</h1>
        <p>Build decks, upload PDFs, and review only what your memory needs right now.</p>
        <div className="row">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="New deck title"
            maxLength={255}
          />
          <button className="button-main" onClick={onCreateDeck} disabled={createDeckMutation.isPending}>
            Create Deck
          </button>
        </div>
        <p>{deckCountLabel}</p>
      </section>

      <section className="surface progress-overview dashboard-momentum">
        <h2>Your Learning Momentum</h2>
        <div className="progress-pill-grid" role="list" aria-label="Overall learning progress snapshot">
          <div className="progress-pill progress-pill-mastered" role="listitem">
            <span className="progress-pill-label">Mastered</span>
            <strong>{overallSnapshot.mastered}</strong>
          </div>
          <div className="progress-pill progress-pill-shaky" role="listitem">
            <span className="progress-pill-label">Shaky</span>
            <strong>{overallSnapshot.shaky}</strong>
          </div>
          <div className="progress-pill progress-pill-upcoming" role="listitem">
            <span className="progress-pill-label">Coming Up</span>
            <strong>{overallSnapshot.upcoming}</strong>
          </div>
        </div>

        <div className="deck-progress-track" aria-label="Overall mastery progress">
          <div
            className="deck-progress-fill"
            style={{ width: `${Math.max(0, Math.min(100, overallMastery))}%` }}
          />
        </div>
        <p className="deck-focus-note">{overallMessage}</p>
      </section>

      <section className="surface dashboard-search-panel">
        <h2>Card Search</h2>
        <div className="row">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(normalizeSearchQuery(event.target.value))}
            placeholder="Search by phrase or concept"
            maxLength={160}
            spellCheck={false}
          />
          <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as "fulltext" | "semantic") }>
            <option value="fulltext">Full-text</option>
            <option value="semantic">Semantic</option>
          </select>
        </div>

        {searchValidationError && normalizedSearchQuery.trim().length > 0 && (
          <p className="deck-focus-note">{searchValidationError}</p>
        )}

        {searchQueryResult.isSuccess && (
          <div className="grid" style={{ marginTop: "0.8rem" }}>
            {searchQueryResult.data.results.slice(0, 6).map((result) => (
              <article key={result.cardId} style={{ borderTop: "1px solid rgba(18, 32, 44, 0.16)", paddingTop: "0.6rem" }}>
                <strong>{result.front}</strong>
                <p>{result.back}</p>
                <small>Score: {result.score.toFixed(3)}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid deck-grid dashboard-deck-grid">
        {decks.map((deck) => (
          <article key={deck.id} className="surface deck-card">
            <h3>{deck.title}</h3>
            <p className="card-stat">Mastery: {deck.masteryPercent.toFixed(1)}%</p>
            <div className="deck-progress-track" aria-label={`Mastery for ${deck.title}`}>
              <div
                className="deck-progress-fill"
                style={{ width: `${Math.max(0, Math.min(100, deck.masteryPercent))}%` }}
              />
            </div>

            <div className="deck-focus-metrics" role="list" aria-label={`Progress snapshot for ${deck.title}`}>
              <div className="focus-metric" role="listitem">
                <span className="focus-metric-label">Mastered</span>
                <strong>{deck.masteredCards}</strong>
              </div>
              <div className="focus-metric" role="listitem">
                <span className="focus-metric-label">Shaky</span>
                <strong>{deck.shakyCards}</strong>
              </div>
              <div className="focus-metric" role="listitem">
                <span className="focus-metric-label">Coming Up</span>
                <strong>{deck.dueToday}</strong>
              </div>
            </div>

            <p className="deck-focus-note">{deckFocusMessage(deck)}</p>
            <p className="card-stat">Last reviewed: {deck.lastReviewedAt ? new Date(deck.lastReviewedAt).toLocaleString() : "Never"}</p>
            <p className="card-stat">Next review: {nextReviewDateLabel(deck.nextReviewDate)}</p>

            <div className="row">
              <Link className="button-main" to={`/review/${deck.id}`} onClick={() => onResumeDeck(deck.id)}>
                Resume
              </Link>
              <Link className="button-alt" to={`/analytics/${deck.id}`}>
                Analytics
              </Link>
            </div>

            <div className="row" style={{ marginTop: "0.8rem" }}>
              <label className="button-alt" style={{ display: "inline-flex" }}>
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => onFilePick(deck.id, event)}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </article>
        ))}
      </section>

      {uploadMutation.isSuccess && (
        <section className="surface">
          <strong>Upload accepted:</strong> file received and ingestion has started.
        </section>
      )}

      {dashboardErrorText && (
        <section className="surface" style={{ color: "#b91c1c" }}>
          {dashboardErrorText}
        </section>
      )}

      <section className="surface mastery-example-panel dashboard-explainer">
        <h2>How Mastered And Shaky Are Calculated</h2>
        <p>These values update automatically after each review submission.</p>
        <div className="mastery-example-grid">
          <article className="mastery-example-card">
            <h3>Mastered Example</h3>
            <p>Rule: repetition count is at least 2 and average grade is at least 3.7.</p>
            <p>Example: Card A reviewed 3 times with grades 4, 4, and 5 has average 4.33, so it is counted as mastered.</p>
          </article>
          <article className="mastery-example-card">
            <h3>Shaky Example</h3>
            <p>Rule: average grade is below 2.5 and card has at least one review history entry.</p>
            <p>Example: Card B reviewed 2 times with grades 2 and 2 has average 2.0, so it is counted as shaky.</p>
          </article>
          <article className="mastery-example-card">
            <h3>Coming Up Example</h3>
            <p>Rule: next review date is today or overdue.</p>
            <p>Example: if next review date is today, it is counted in Coming Up until you review it.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
