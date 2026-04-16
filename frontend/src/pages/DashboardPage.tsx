import { ChangeEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import { useAuthStore } from "../store/authStore";

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const [title, setTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"fulltext" | "semantic">("fulltext");
  const queryClient = useQueryClient();

  const decksQuery = useQuery({
    queryKey: ["decks"],
    queryFn: () => apiClient.listDecks(token as string),
    enabled: Boolean(token),
  });

  const createDeckMutation = useMutation({
    mutationFn: () => apiClient.createDeck(title, token as string),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) =>
      apiClient.uploadPdf(deckId, file, token as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });

  const searchQueryResult = useQuery({
    queryKey: ["deck-search", searchQuery, searchMode],
    queryFn: () => apiClient.search(searchQuery, searchMode, token as string),
    enabled: Boolean(token) && searchQuery.trim().length >= 2,
  });

  const decks = decksQuery.data ?? [];

  const onCreateDeck = () => {
    if (!title.trim()) {
      return;
    }
    createDeckMutation.mutate();
  };

  const onFilePick = (deckId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    uploadMutation.mutate({ deckId, file });
  };

  const onResumeDeck = (deckId: string) => {
    queryClient.removeQueries({ queryKey: ["deck-session", deckId] });
    queryClient.removeQueries({ queryKey: ["due-cards", deckId] });
    queryClient.removeQueries({ queryKey: ["deck-cards", deckId] });
  };

  const deckCountLabel = useMemo(() => `${decks.length} deck${decks.length === 1 ? "" : "s"}`, [decks.length]);

  return (
    <div className="grid">
      <section className="surface">
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

      <section className="surface">
        <h2>Card Search</h2>
        <div className="row">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by phrase or concept"
          />
          <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as "fulltext" | "semantic") }>
            <option value="fulltext">Full-text</option>
            <option value="semantic">Semantic</option>
          </select>
        </div>

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

      <section className="grid deck-grid">
        {decks.map((deck) => (
          <article key={deck.id} className="surface">
            <h3>{deck.title}</h3>
            <p className="card-stat">Mastery: {deck.masteryPercent.toFixed(1)}%</p>
            <p className="card-stat">Due today: {deck.dueToday}</p>
            <p className="card-stat">Shaky: {deck.shakyCards}</p>
            <p className="card-stat">Last reviewed: {deck.lastReviewedAt ? new Date(deck.lastReviewedAt).toLocaleString() : "Never"}</p>

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
          <strong>Upload accepted:</strong> {uploadMutation.data.message} ({uploadMutation.data.status})
        </section>
      )}

      {(decksQuery.isError || createDeckMutation.isError || uploadMutation.isError) && (
        <section className="surface" style={{ color: "#b91c1c" }}>
          {(decksQuery.error as Error)?.message ||
            (createDeckMutation.error as Error)?.message ||
            (uploadMutation.error as Error)?.message}
        </section>
      )}
    </div>
  );
}
