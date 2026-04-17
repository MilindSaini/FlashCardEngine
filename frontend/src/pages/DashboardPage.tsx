import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiClient } from "../api/client";
import { DeckSummary, IngestionJobStatus } from "../api/types";
import { useAuthStore } from "../store/authStore";
import {
  isValidUuid,
  normalizeDeckTitle,
  normalizeSearchQuery,
  validateDeckTitle,
  validatePdfFile,
  validateSearchQuery,
} from "../types/validation";

const DECKS_PER_PAGE = 9;

type DeckSortMode = "due" | "recent" | "mastery" | "shaky" | "title" | "created";
type IngestionJobRef = {
  deckId: string;
  jobId: string;
  status: IngestionJobStatus["status"];
};

function ingestionProgressPercent(job: IngestionJobStatus | undefined) {
  if (!job) {
    return 0;
  }
  if (job.status === "COMPLETED") {
    return 100;
  }
  if (job.totalChunks <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((job.processedChunks / job.totalChunks) * 100)));
}

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

function normalizeTypeLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compareDecks(sortMode: DeckSortMode, left: DeckSummary, right: DeckSummary) {
  const leftLastReviewed = left.lastReviewedAt ? new Date(left.lastReviewedAt).getTime() : 0;
  const rightLastReviewed = right.lastReviewedAt ? new Date(right.lastReviewedAt).getTime() : 0;

  switch (sortMode) {
    case "recent":
      return rightLastReviewed - leftLastReviewed;
    case "mastery":
      return right.masteryPercent - left.masteryPercent;
    case "shaky":
      return right.shakyCards - left.shakyCards;
    case "title":
      return left.title.localeCompare(right.title);
    case "created":
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    case "due":
    default:
      return right.dueToday - left.dueToday;
  }
}

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const [title, setTitle] = useState("");
  const [deckFilterQuery, setDeckFilterQuery] = useState("");
  const [deckSortMode, setDeckSortMode] = useState<DeckSortMode>("due");
  const [deckPage, setDeckPage] = useState(1);
  const [activeDeckMenuId, setActiveDeckMenuId] = useState<string | null>(null);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJobRef[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"fulltext" | "semantic">("fulltext");
  const [searchDeckId, setSearchDeckId] = useState<string>("all");
  const ingestionNoticeJobIdsRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
      toast.success("Deck created successfully.");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["my-streak"] });
    },
    onError: () => {
      toast.error("Could not create the deck right now. Please try again.", { id: "create-deck-error" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) =>
      apiClient.uploadPdf(deckId, file, token as string),
    onSuccess: (response, variables) => {
      toast.success("Upload accepted. Card generation has started.");
      if (isValidUuid(response.jobId)) {
        setIngestionJobs((previous) => {
          const deduped = previous.filter((job) => job.jobId !== response.jobId);
          return [{ deckId: variables.deckId, jobId: response.jobId, status: response.status }, ...deduped].slice(0, 8);
        });
      }
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["my-streak"] });
    },
    onError: () => {
      toast.error("Upload failed. Please try another file or retry.", { id: "upload-error" });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: (deckId: string) => apiClient.deleteDeck(deckId, token as string),
    onSuccess: (_response, deckId) => {
      setActiveDeckMenuId(null);
      if (searchDeckId === deckId) {
        setSearchDeckId("all");
      }
      toast.success("Deck deleted permanently.");
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["my-streak"] });
    },
    onError: () => {
      toast.error("Could not delete this deck right now. Please retry.", { id: "delete-deck-error" });
    },
  });

  const searchQueryResult = useQuery({
    queryKey: ["deck-search", normalizedSearchQuery, searchMode, searchDeckId],
    queryFn: () =>
      apiClient.search(
        normalizedSearchQuery,
        searchMode,
        token as string,
        searchDeckId === "all" ? undefined : searchDeckId
      ),
    enabled: Boolean(token) && !searchValidationError && normalizedSearchQuery.trim().length >= 2,
  });

  const ingestionJobQueries = useQueries({
    queries: ingestionJobs.map((job) => ({
      queryKey: ["ingestion-job", job.jobId],
      queryFn: () => apiClient.getIngestionJob(job.jobId, token as string),
      enabled: Boolean(token),
      refetchInterval:
        job.status === "QUEUED" || job.status === "PROCESSING"
          ? 2000
          : false,
      refetchIntervalInBackground: true,
      staleTime: 0,
    })),
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

  useEffect(() => {
    const onWindowClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".deck-menu")) {
        setActiveDeckMenuId(null);
      }
    };

    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  useEffect(() => {
    setDeckPage(1);
  }, [deckFilterQuery, deckSortMode]);

  const decks = decksQuery.data ?? [];

  const deckById = useMemo(
    () => new Map(decks.map((deck) => [deck.id, deck])),
    [decks]
  );

  useEffect(() => {
    setIngestionJobs((previous) => {
      let changed = false;
      const next = previous.map((job, index) => {
        const status = ingestionJobQueries[index]?.data?.status;
        if (!status || status === job.status) {
          return job;
        }

        changed = true;
        return { ...job, status };
      });

      return changed ? next : previous;
    });

    ingestionJobQueries.forEach((query, index) => {
      const job = ingestionJobs[index];
      const data = query.data;

      if (!job || !data) {
        return;
      }

      if (ingestionNoticeJobIdsRef.current.has(data.jobId)) {
        return;
      }

      if (data.status === "COMPLETED") {
        ingestionNoticeJobIdsRef.current.add(data.jobId);
        toast.success(`Ingestion completed for ${deckById.get(job.deckId)?.title ?? "your deck"}.`);
        queryClient.invalidateQueries({ queryKey: ["decks"] });
        return;
      }

      if (data.status === "FAILED") {
        ingestionNoticeJobIdsRef.current.add(data.jobId);
        toast.error(data.errorMessage || "Ingestion failed. Please retry this upload.", {
          id: `ingestion-failed-${data.jobId}`,
        });
      }
    });
  }, [deckById, ingestionJobQueries, ingestionJobs, queryClient]);

  const filteredAndSortedDecks = useMemo(() => {
    const normalizedFilter = normalizeSearchQuery(deckFilterQuery).toLowerCase();
    const filtered = normalizedFilter
      ? decks.filter((deck) => deck.title.toLowerCase().includes(normalizedFilter))
      : decks;

    return [...filtered].sort((left, right) => compareDecks(deckSortMode, left, right));
  }, [decks, deckFilterQuery, deckSortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedDecks.length / DECKS_PER_PAGE));
  const currentPage = Math.min(deckPage, totalPages);

  useEffect(() => {
    if (deckPage > totalPages) {
      setDeckPage(totalPages);
    }
  }, [deckPage, totalPages]);

  const pagedDecks = useMemo(() => {
    const start = (currentPage - 1) * DECKS_PER_PAGE;
    return filteredAndSortedDecks.slice(start, start + DECKS_PER_PAGE);
  }, [currentPage, filteredAndSortedDecks]);

  const showingFrom = filteredAndSortedDecks.length === 0 ? 0 : (currentPage - 1) * DECKS_PER_PAGE + 1;
  const showingTo = Math.min(currentPage * DECKS_PER_PAGE, filteredAndSortedDecks.length);

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

  const onDeleteDeck = (deck: DeckSummary) => {
    if (!isValidUuid(deck.id)) {
      toast.error("Invalid deck id. Please refresh and try again.", { id: "delete-deck-validation" });
      return;
    }

    const confirmed = window.confirm(
      `Delete deck \"${deck.title}\" permanently? This removes all cards, progress, and analytics for this deck.`
    );

    if (!confirmed) {
      return;
    }

    deleteDeckMutation.mutate(deck.id);
  };

  const onOpenSearchDeck = (deckId: string) => {
    onResumeDeck(deckId);
    navigate(`/review/${deckId}`);
  };

  const onOpenSearchCard = (deckId: string, cardId: string) => {
    if (!isValidUuid(deckId) || !isValidUuid(cardId)) {
      toast.error("Search result link is invalid. Please try another result.", { id: "search-open-invalid" });
      return;
    }

    onResumeDeck(deckId);
    navigate(`/review/${deckId}/${cardId}`);
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
      : deleteDeckMutation.isError
        ? "Deck could not be deleted right now."
        : decksQuery.isError
          ? "Dashboard data could not be loaded. Please refresh."
          : null;

  const searchResults = searchQueryResult.data?.results ?? [];

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

      <section className="surface dashboard-ingestion-panel">
        <h2>Ingestion Queue</h2>
        {ingestionJobs.length === 0 && <p className="deck-focus-note">No active ingestion jobs.</p>}

        {ingestionJobs.length > 0 && (
          <div className="dashboard-ingestion-list">
            {ingestionJobs.map((job, index) => {
              const jobQuery = ingestionJobQueries[index];
              const jobData = jobQuery?.data;
              const deckTitle = deckById.get(job.deckId)?.title ?? "Deck";
              const progressPercent = ingestionProgressPercent(jobData);
              const stage = jobData?.stage?.replaceAll("_", " ") ?? "queued";
              const status = jobData?.status ?? job.status;

              return (
                <article key={job.jobId} className="dashboard-ingestion-card">
                  <div className="dashboard-ingestion-head">
                    <strong>{deckTitle}</strong>
                    <span className={`dashboard-ingestion-status status-${status.toLowerCase()}`}>{status}</span>
                  </div>

                  <p className="deck-focus-note">Stage: {stage}</p>

                  <div className="deck-progress-track" aria-label={`Ingestion progress for ${deckTitle}`}>
                    <div className="deck-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>

                  <div className="dashboard-ingestion-meta">
                    <span>
                      Chunks: {jobData?.processedChunks ?? 0}
                      {jobData?.totalChunks ? ` / ${jobData.totalChunks}` : ""}
                    </span>
                    <span>Cards: {jobData?.cardsCreated ?? 0}</span>
                  </div>

                  {jobData?.errorMessage && (
                    <p className="dashboard-ingestion-error">{jobData.errorMessage}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface dashboard-search-panel">
        <h2>Card Search</h2>
        <div className="dashboard-search-shell" role="search">
          <span className="dashboard-search-icon" aria-hidden="true">Search</span>
          <input
            className="dashboard-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(normalizeSearchQuery(event.target.value))}
            placeholder="Ask a concept or phrase"
            maxLength={160}
            spellCheck={false}
          />
          {normalizedSearchQuery.trim().length > 0 && (
            <button
              type="button"
              className="dashboard-search-clear"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="dashboard-search-controls">
          <label>
            <span>Mode</span>
            <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as "fulltext" | "semantic") }>
              <option value="fulltext">Full-text</option>
              <option value="semantic">Semantic</option>
            </select>
          </label>

          <label>
            <span>Deck Scope</span>
            <select value={searchDeckId} onChange={(event) => setSearchDeckId(event.target.value)}>
              <option value="all">All decks</option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>{deck.title}</option>
              ))}
            </select>
          </label>
        </div>

        {searchValidationError && normalizedSearchQuery.trim().length > 0 && (
          <p className="deck-focus-note">{searchValidationError}</p>
        )}

        {searchQueryResult.isFetching && normalizedSearchQuery.trim().length >= 2 && (
          <p className="deck-focus-note">Searching cards...</p>
        )}

        {searchQueryResult.isSuccess && searchResults.length === 0 && (
          <p className="deck-focus-note">No cards matched this search. Try another phrase or switch mode.</p>
        )}

        {searchQueryResult.isSuccess && searchResults.length > 0 && (
          <div className="dashboard-search-result-list">
            {searchResults.slice(0, 12).map((result) => (
              <article key={result.cardId} className="dashboard-search-result-card">
                <div className="dashboard-search-result-head">
                  <strong>{result.front}</strong>
                  <small>Score {result.score.toFixed(3)}</small>
                </div>
                <p>{result.back}</p>
                <div className="dashboard-search-result-meta">
                  <span>{deckById.get(result.deckId)?.title ?? "Deck unavailable"}</span>
                  <span>{normalizeTypeLabel(result.type)}</span>
                </div>
                <div className="row">
                  <button className="button-main" type="button" onClick={() => onOpenSearchCard(result.deckId, result.cardId)}>
                    Open card
                  </button>
                  <button className="button-alt" type="button" onClick={() => onOpenSearchDeck(result.deckId)}>
                    Open deck
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="surface dashboard-browse-panel">
        <h2>Browse Decks</h2>
        <p>Handle large libraries with title filters, sorting, and quick resume actions.</p>
        <div className="dashboard-browse-controls">
          <input
            value={deckFilterQuery}
            onChange={(event) => setDeckFilterQuery(event.target.value)}
            placeholder="Filter by deck title"
            maxLength={160}
          />
          <select value={deckSortMode} onChange={(event) => setDeckSortMode(event.target.value as DeckSortMode)}>
            <option value="due">Sort: Highest due first</option>
            <option value="recent">Sort: Recently reviewed</option>
            <option value="mastery">Sort: Highest mastery</option>
            <option value="shaky">Sort: Most shaky cards</option>
            <option value="title">Sort: Title A-Z</option>
            <option value="created">Sort: Newest created</option>
          </select>
        </div>
        <p className="deck-focus-note">
          Showing {showingFrom}-{showingTo} of {filteredAndSortedDecks.length} matching decks.
        </p>
      </section>

      <section className="grid deck-grid dashboard-deck-grid">
        {pagedDecks.map((deck) => (
          <article key={deck.id} className="surface deck-card">
            <div className="deck-card-head">
              <h3>{deck.title}</h3>
              <div className="deck-menu">
                <button
                  type="button"
                  className="deck-menu-button"
                  aria-label={`More options for ${deck.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveDeckMenuId((previous) => previous === deck.id ? null : deck.id);
                  }}
                >
                  ...
                </button>
                {activeDeckMenuId === deck.id && (
                  <div className="deck-menu-popover" role="menu">
                    <button
                      type="button"
                      className="deck-menu-delete"
                      onClick={() => onDeleteDeck(deck)}
                      disabled={deleteDeckMutation.isPending}
                    >
                      Delete deck permanently
                    </button>
                  </div>
                )}
              </div>
            </div>

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

      {filteredAndSortedDecks.length === 0 && (
        <section className="surface">
          <strong>No decks match your current filters.</strong>
          <p className="deck-focus-note">Try changing the title filter or sort order.</p>
        </section>
      )}

      {filteredAndSortedDecks.length > 0 && (
        <section className="surface dashboard-pagination">
          <div className="row">
            <button
              className="button-alt"
              type="button"
              onClick={() => setDeckPage((previous) => Math.max(previous - 1, 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <span className="dashboard-page-indicator">Page {currentPage} of {totalPages}</span>
            <button
              className="button-alt"
              type="button"
              onClick={() => setDeckPage((previous) => Math.min(previous + 1, totalPages))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </section>
      )}

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
