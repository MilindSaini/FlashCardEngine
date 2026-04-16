import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { DueCard, ReviewResponse } from "../api/types";
import { CardFlip } from "../components/CardFlip";
import { useAuthStore } from "../store/authStore";

type SessionMode = "due" | "all";

const FIRST_ARRIVAL_REFRESH_KEY_PREFIX = "review-first-arrival-refreshed:";

function difficultyBadge(review: ReviewResponse | null) {
  if (!review) {
    return { label: "No signal yet", className: "badge yellow", icon: "🟡" };
  }
  if (review.averageGrade >= 4) {
    return { label: "Stable memory", className: "badge green", icon: "🟢" };
  }
  if (review.averageGrade < 2.5) {
    return { label: "Fragile memory", className: "badge red", icon: "🔴" };
  }
  return { label: "Building memory", className: "badge yellow", icon: "🟡" };
}

export function ReviewSessionPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId } = useParams<{ deckId: string }>();
  const [cards, setCards] = useState<DueCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sessionMode, setSessionMode] = useState<SessionMode>("due");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [lastReview, setLastReview] = useState<ReviewResponse | null>(null);
  const reviewedCardIdsRef = useRef<Set<string>>(new Set());
  const sawInitialDuePayloadRef = useRef(false);
  const startedWithoutCardsRef = useRef(false);
  const skipNextSessionPersistRef = useRef(true);
  const cardsRef = useRef<DueCard[]>([]);
  const currentIndexRef = useRef(0);
  const completedCountRef = useRef(0);
  const totalCountRef = useRef(0);
  const sessionModeRef = useRef<SessionMode>("due");
  const lastPersistedSessionKeyRef = useRef<string>("");
  const queryClient = useQueryClient();

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    completedCountRef.current = completedCount;
  }, [completedCount]);

  useEffect(() => {
    totalCountRef.current = totalCount;
  }, [totalCount]);

  useEffect(() => {
    sessionModeRef.current = sessionMode;
  }, [sessionMode]);

  const sessionQuery = useQuery({
    queryKey: ["deck-session", deckId],
    queryFn: () => apiClient.getSession(deckId as string, token as string),
    enabled: Boolean(deckId && token),
  });

  const dueCardsQuery = useQuery({
    queryKey: ["due-cards", deckId],
    queryFn: () => apiClient.dueCards(deckId as string, token as string),
    enabled: Boolean(deckId && token),
    refetchInterval: sessionMode === "due" ? 4000 : 10000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const deckCardsQuery = useQuery({
    queryKey: ["deck-cards", deckId],
    queryFn: () => apiClient.deckCards(deckId as string, token as string),
    enabled: Boolean(deckId && token),
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const sessionMutation = useMutation({
    mutationFn: (payload: {
      currentCardIndex: number;
      completedCards: number;
      totalCards: number;
      allCardsMode: boolean;
    }) => apiClient.updateSession(deckId as string, payload, token as string),
  });

  useEffect(() => {
    setCards([]);
    setCurrentIndex(0);
    setCompletedCount(0);
    setTotalCount(0);
    setSessionMode("due");
    setSessionHydrated(false);
    setFlipped(false);
    setLastReview(null);
    reviewedCardIdsRef.current = new Set();
    sawInitialDuePayloadRef.current = false;
    startedWithoutCardsRef.current = false;
    skipNextSessionPersistRef.current = true;
    lastPersistedSessionKeyRef.current = "";
  }, [deckId]);

  useEffect(() => {
    if (!sessionQuery.data || sessionHydrated) {
      return;
    }

    setCurrentIndex(Math.max(0, sessionQuery.data.currentCardIndex));
    setCompletedCount(Math.max(0, sessionQuery.data.completedCards));
    setTotalCount(Math.max(0, sessionQuery.data.totalCards));
    setSessionMode(sessionQuery.data.allCardsMode ? "all" : "due");
    setSessionHydrated(true);
    skipNextSessionPersistRef.current = true;
  }, [sessionQuery.data, sessionHydrated]);

  useEffect(() => {
    const discoveredTotalCards = deckCardsQuery.data?.length ?? 0;
    if (discoveredTotalCards <= 0) {
      return;
    }

    setTotalCount((previous) => Math.max(previous, discoveredTotalCards));
  }, [deckCardsQuery.data]);

  useEffect(() => {
    if (!sessionHydrated || sessionMode !== "due" || !dueCardsQuery.data) {
      return;
    }

    if (!sawInitialDuePayloadRef.current) {
      sawInitialDuePayloadRef.current = true;
      startedWithoutCardsRef.current = dueCardsQuery.data.length === 0;
    }

    if (dueCardsQuery.data.length > 0 && startedWithoutCardsRef.current && deckId) {
      const refreshKey = `${FIRST_ARRIVAL_REFRESH_KEY_PREFIX}${deckId}`;
      if (!sessionStorage.getItem(refreshKey)) {
        sessionStorage.setItem(refreshKey, "1");
        window.location.reload();
        return;
      }
    }

    setCards((previous) => {
      const existingIds = new Set(previous.map((card) => card.id));
      const merged = [...previous];
      let hasNewCard = false;

      for (const incoming of dueCardsQuery.data) {
        if (existingIds.has(incoming.id) || reviewedCardIdsRef.current.has(incoming.id)) {
          continue;
        }
        merged.push(incoming);
        existingIds.add(incoming.id);
        hasNewCard = true;
      }

      return hasNewCard ? merged : previous;
    });
  }, [dueCardsQuery.data, deckId, sessionHydrated, sessionMode]);

  useEffect(() => {
    if (!sessionHydrated || sessionMode !== "all" || !deckCardsQuery.data) {
      return;
    }

    setCards((previous) => {
      if (previous.length === 0) {
        return deckCardsQuery.data.length > 0 ? deckCardsQuery.data : previous;
      }

      const existingIds = new Set(previous.map((card) => card.id));
      const merged = [...previous];
      let hasNewCard = false;

      for (const incoming of deckCardsQuery.data) {
        if (existingIds.has(incoming.id) || reviewedCardIdsRef.current.has(incoming.id)) {
          continue;
        }
        merged.push(incoming);
        existingIds.add(incoming.id);
        hasNewCard = true;
      }

      return hasNewCard ? merged : previous;
    });
  }, [deckCardsQuery.data, sessionHydrated, sessionMode]);

  useEffect(() => {
    if (!sessionHydrated || !deckId || !token) {
      return;
    }

    if (skipNextSessionPersistRef.current) {
      skipNextSessionPersistRef.current = false;
      return;
    }

    const payload = {
      currentCardIndex: currentIndex,
      completedCards: completedCount,
      totalCards: totalCount,
      allCardsMode: sessionMode === "all",
    };

    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPersistedSessionKeyRef.current || sessionMutation.isPending) {
      return;
    }

    lastPersistedSessionKeyRef.current = payloadKey;
    sessionMutation.mutate(payload);
  }, [
    sessionHydrated,
    deckId,
    token,
    currentIndex,
    completedCount,
    totalCount,
    sessionMode,
    sessionMutation.mutate,
    sessionMutation.isPending,
  ]);

  useEffect(() => {
    if (cards.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((previous) => Math.min(previous, cards.length - 1));
  }, [cards.length]);

  const startAllCardsCycle = useMemo(
    () => () => {
      const deckCards = deckCardsQuery.data ?? [];
      if (deckCards.length === 0) {
        return false;
      }

      reviewedCardIdsRef.current = new Set();
      setSessionMode("all");
      setCards(deckCards);
      setCurrentIndex(0);
      setCompletedCount(0);
      setTotalCount(deckCards.length);
      setFlipped(false);
      setLastReview(null);
      return true;
    },
    [deckCardsQuery.data]
  );

  useEffect(() => {
    if (!sessionHydrated || cards.length > 0) {
      return;
    }

    const hasReachedHundred = totalCount > 0 && completedCount >= totalCount;
    if (!hasReachedHundred) {
      return;
    }

    startAllCardsCycle();
  }, [sessionHydrated, cards.length, totalCount, completedCount, startAllCardsCycle]);

  const goPrevious = useMemo(
    () => () => {
      setCurrentIndex((index) => Math.max(0, index - 1));
      setFlipped(false);
    },
    []
  );

  const goNext = useMemo(
    () => () => {
      setCurrentIndex((index) => Math.min(cardsRef.current.length - 1, index + 1));
      setFlipped(false);
    },
    []
  );

  useEffect(() => {
    if (!cards[currentIndex]) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputTarget = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (isInputTarget) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cards, currentIndex, goPrevious, goNext]);

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, grade }: { cardId: string; grade: number }) =>
      apiClient.submitReview(cardId, grade, token as string),
    onSuccess: (response, variables) => {
      if (response.mastered) {
        confetti({
          particleCount: 110,
          spread: 65,
          origin: { y: 0.7 },
        });
      }

      reviewedCardIdsRef.current.add(variables.cardId);
      setLastReview(response);
      setFlipped(false);

      const previousCards = cardsRef.current;
      const remainingCards = previousCards.filter((card) => card.id !== variables.cardId);
      const discoveredTotal = deckCardsQuery.data?.length ?? 0;
      const nextTotal = Math.max(totalCountRef.current, discoveredTotal, previousCards.length);
      const nextCompleted = Math.min(completedCountRef.current + 1, Math.max(nextTotal, 1));
      const shouldRestartWithAllCards =
        remainingCards.length === 0
        && (
          (nextTotal > 0 && nextCompleted >= nextTotal)
          || sessionModeRef.current === "all"
        );

      if (shouldRestartWithAllCards && startAllCardsCycle()) {
        queryClient.invalidateQueries({ queryKey: ["decks"] });
        return;
      }

      setCards(remainingCards);
      setCurrentIndex((index) => Math.min(index, Math.max(remainingCards.length - 1, 0)));
      setCompletedCount(nextCompleted);
      setTotalCount(nextTotal);
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["due-cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["deck-cards", deckId] });
    },
  });

  const currentCard = cards[currentIndex] ?? null;
  const progressPercent = totalCount === 0 ? 0 : Math.min(100, (completedCount / totalCount) * 100);
  const badge = difficultyBadge(lastReview);

  const gradeButtons = useMemo(() => [1, 2, 3, 4, 5], []);
  const canMoveBack = currentIndex > 0;
  const canMoveForward = currentIndex < cards.length - 1;

  if (sessionQuery.isLoading || !sessionHydrated) {
    return <section className="surface">Loading review session...</section>;
  }

  if (!currentCard) {
    const hasReachedHundred = totalCount > 0 && completedCount >= totalCount;
    const waitingOnDueCards = sessionMode === "due" && dueCardsQuery.isFetching;
    const waitingOnDeckCards = deckCardsQuery.isFetching;

    const title = hasReachedHundred ? "Refreshing Deck" : "Waiting For Cards";
    const message = hasReachedHundred
      ? "Progress hit 100%. Reloading your full deck cards for a fresh pass."
      : "No cards are visible right now. If PDF ingestion is running, cards will appear automatically.";

    return (
      <section className="surface">
        <h2>{title}</h2>
        <p>{message}</p>
        <p>{waitingOnDueCards || waitingOnDeckCards ? "Syncing latest cards..." : "Use Refresh if you want to force-check now."}</p>
        <div className="row">
          <button
            className="button-alt"
            onClick={() => {
              void dueCardsQuery.refetch();
              void deckCardsQuery.refetch();
            }}
            disabled={dueCardsQuery.isFetching || deckCardsQuery.isFetching}
          >
            {dueCardsQuery.isFetching || deckCardsQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
          {hasReachedHundred && (
            <button className="button-main" onClick={() => startAllCardsCycle()}>
              Start Full Deck
            </button>
          )}
          <Link className="button-main" to="/">
            Back to Dashboard
          </Link>
          {deckId && (
            <Link className="button-alt" to={`/analytics/${deckId}`}>
              View Analytics
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="surface">
        <h1>Review Session</h1>
        <p>Progress: {progressPercent.toFixed(1)}% ({completedCount}/{totalCount || 0})</p>
        <p>Mode: {sessionMode === "all" ? "All cards" : "Due cards"}</p>
        <p>Card: {currentIndex + 1} / {cards.length}</p>
        <p>{dueCardsQuery.isFetching ? "Checking for new generated cards..." : "Live queue updates are active."}</p>
        <div
          style={{
            width: "100%",
            height: 12,
            borderRadius: 999,
            background: "#dde8ef",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #14b8a6, #ff5e2c)",
            }}
          />
        </div>
      </section>

      <section className="surface">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.8rem" }}>
          <button className="button-alt" onClick={goPrevious} disabled={!canMoveBack || reviewMutation.isPending}>
            ← Previous
          </button>
          <button className="button-alt" onClick={goNext} disabled={!canMoveForward || reviewMutation.isPending}>
            Next →
          </button>
        </div>

        <CardFlip
          front={currentCard.front}
          back={currentCard.back}
          flipped={flipped}
          onToggle={() => setFlipped((value) => !value)}
        />
      </section>

      <section className="surface grid">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Grade Recall (0-5)</strong>
          <span className={badge.className}>
            {badge.icon} {badge.label}
          </span>
        </div>

        <div className="grade-grid">
          {gradeButtons.map((grade) => (
            <button
              key={grade}
              onClick={() => reviewMutation.mutate({ cardId: currentCard.id, grade })}
              disabled={reviewMutation.isPending}
            >
              {grade}
            </button>
          ))}
        </div>

        {lastReview && (
          <p>
            Next review: {lastReview.nextReviewDate} | Interval: {lastReview.intervalDays} day(s) | EF: {lastReview.easinessFactor.toFixed(2)}
          </p>
        )}
      </section>

      {(dueCardsQuery.isError || deckCardsQuery.isError || sessionQuery.isError || reviewMutation.isError || sessionMutation.isError) && (
        <section className="surface" style={{ color: "#b91c1c" }}>
          {(dueCardsQuery.error as Error)?.message ||
            (deckCardsQuery.error as Error)?.message ||
            (sessionQuery.error as Error)?.message ||
            (sessionMutation.error as Error)?.message ||
            (reviewMutation.error as Error)?.message}
        </section>
      )}
    </div>
  );
}
