import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { DueCard, ReviewResponse } from "../api/types";
import { CardFlip } from "../components/CardFlip";
import { useAuthStore } from "../store/authStore";

type SessionMode = "due" | "all";
type GradeEffectClass = "" | "grade-hit-1" | "grade-hit-2" | "grade-hit-3" | "grade-hit-4" | "grade-hit-5";
type LeitnerBox = 1 | 2 | 3 | 4 | 5;

const FIRST_ARRIVAL_REFRESH_KEY_PREFIX = "review-first-arrival-refreshed:";
const CARD_FADE_MS = 240;

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

function nextLeitnerBox(currentBox: LeitnerBox, grade: number): LeitnerBox {
  if (grade <= 1) {
    return 1;
  }

  if (grade === 2) {
    return currentBox <= 2 ? 1 : 2;
  }

  if (grade === 3) {
    if (currentBox <= 1) {
      return 2;
    }
    return 3;
  }

  if (grade === 4) {
    return 4;
  }

  return 5;
}

function computeLeitnerReinsertIndex(box: LeitnerBox, currentIndex: number, remainingLength: number) {
  if (remainingLength <= 0) {
    return 0;
  }

  if (box === 1) {
    return Math.min(currentIndex + 1, remainingLength);
  }

  if (box === 2) {
    return Math.min(currentIndex + 3, remainingLength);
  }

  return Math.min(currentIndex + 6, remainingLength);
}

export function ReviewSessionPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId, cardId } = useParams<{ deckId: string; cardId?: string }>();
  const navigate = useNavigate();
  const [cards, setCards] = useState<DueCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sessionMode, setSessionMode] = useState<SessionMode>("all");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [lastReview, setLastReview] = useState<ReviewResponse | null>(null);
  const [gradeEffectClass, setGradeEffectClass] = useState<GradeEffectClass>("");
  const [gradeReaction, setGradeReaction] = useState("");
  const [fadingCardId, setFadingCardId] = useState<string | null>(null);
  const reviewedCardIdsRef = useRef<Set<string>>(new Set());
  const sawInitialDuePayloadRef = useRef(false);
  const startedWithoutCardsRef = useRef(false);
  const skipNextSessionPersistRef = useRef(true);
  const cardsRef = useRef<DueCard[]>([]);
  const leitnerBoxesRef = useRef<Record<string, LeitnerBox>>({});
  const currentIndexRef = useRef(0);
  const completedCountRef = useRef(0);
  const totalCountRef = useRef(0);
  const lastPersistedSessionKeyRef = useRef<string>("");
  const gradeEffectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const triggerGradeAnimation = (grade: number, mastered: boolean) => {
    if (gradeEffectTimeoutRef.current) {
      clearTimeout(gradeEffectTimeoutRef.current);
      gradeEffectTimeoutRef.current = null;
    }

    if (grade === 1) {
      setGradeEffectClass("grade-hit-1");
      setGradeReaction("Tough one. Bounce back on the next card.");
      confetti({
        particleCount: 34,
        spread: 34,
        angle: 120,
        startVelocity: 22,
        gravity: 1.5,
        scalar: 0.8,
        origin: { x: 0, y: 0.84 },
        colors: ["#ef4444", "#f97316", "#f59e0b"],
      });
      confetti({
        particleCount: 34,
        spread: 34,
        angle: 60,
        startVelocity: 22,
        gravity: 1.5,
        scalar: 0.8,
        origin: { x: 1, y: 0.84 },
        colors: ["#ef4444", "#f97316", "#f59e0b"],
      });
    } else if (grade === 2) {
      setGradeEffectClass("grade-hit-2");
      setGradeReaction("Warming up. Keep going.");
      confetti({
        particleCount: 46,
        spread: 50,
        startVelocity: 28,
        gravity: 1.2,
        scalar: 0.86,
        origin: { x: 0.5, y: 0.78 },
        colors: ["#f97316", "#f59e0b", "#fb7185"],
      });
    } else if (grade === 3) {
      setGradeEffectClass("grade-hit-3");
      setGradeReaction("Nice. Solid recall.");
      confetti({
        particleCount: 58,
        spread: 64,
        startVelocity: 34,
        gravity: 1.05,
        scalar: 0.95,
        origin: { x: 0.5, y: 0.75 },
        colors: ["#14b8a6", "#2dd4bf", "#f59e0b", "#f97316"],
      });
    } else if (grade === 4) {
      setGradeEffectClass("grade-hit-4");
      setGradeReaction("Great recall.");
      confetti({
        particleCount: 56,
        spread: 56,
        angle: 105,
        startVelocity: 40,
        gravity: 0.95,
        scalar: 1.02,
        origin: { x: 0, y: 0.8 },
        colors: ["#14b8a6", "#2dd4bf", "#22c55e", "#f59e0b"],
      });
      confetti({
        particleCount: 56,
        spread: 56,
        angle: 75,
        startVelocity: 40,
        gravity: 0.95,
        scalar: 1.02,
        origin: { x: 1, y: 0.8 },
        colors: ["#14b8a6", "#2dd4bf", "#22c55e", "#f59e0b"],
      });
    } else {
      setGradeEffectClass("grade-hit-5");
      setGradeReaction(mastered ? "Perfect recall. Mastery unlocked." : "Perfect recall. Amazing hit.");

      const total = 180;
      const burst = (ratio: number, options: Parameters<typeof confetti>[0]) => {
        confetti({
          ...options,
          particleCount: Math.floor(total * ratio),
        });
      };

      burst(0.25, {
        spread: 28,
        startVelocity: 56,
        origin: { y: 0.74 },
        colors: ["#22c55e", "#14b8a6", "#f59e0b", "#ff5e2c"],
      });
      burst(0.2, {
        spread: 52,
        startVelocity: 44,
        origin: { y: 0.72 },
        colors: ["#22c55e", "#14b8a6", "#f59e0b", "#ff5e2c"],
      });
      burst(0.35, {
        spread: 108,
        decay: 0.9,
        scalar: 0.9,
        origin: { y: 0.68 },
        colors: ["#22c55e", "#14b8a6", "#f59e0b", "#ff5e2c"],
      });
      burst(0.2, {
        spread: 126,
        startVelocity: 28,
        decay: 0.92,
        scalar: 1.08,
        origin: { y: 0.64 },
        colors: ["#22c55e", "#14b8a6", "#f59e0b", "#ff5e2c"],
      });
    }

    gradeEffectTimeoutRef.current = setTimeout(() => {
      setGradeEffectClass("");
      setGradeReaction("");
    }, 1000);
  };

  const syncReviewRoute = useMemo(
    () => (nextCardId: string | null, replace = true) => {
      if (!deckId) {
        return;
      }

      const nextPath = nextCardId ? `/review/${deckId}/${nextCardId}` : `/review/${deckId}`;
      navigate(nextPath, { replace });
    },
    [deckId, navigate]
  );

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
    return () => {
      if (gradeEffectTimeoutRef.current) {
        clearTimeout(gradeEffectTimeoutRef.current);
      }
    };
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["deck-session", deckId],
    queryFn: () => apiClient.getSession(deckId as string, token as string),
    enabled: Boolean(deckId && token),
    refetchOnMount: "always",
  });

  const dueCardsQuery = useQuery({
    queryKey: ["due-cards", deckId],
    queryFn: () => apiClient.dueCards(deckId as string, token as string),
    enabled: Boolean(deckId && token),
    refetchInterval: sessionMode === "due" ? 4000 : 10000,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchOnMount: "always",
  });

  const deckCardsQuery = useQuery({
    queryKey: ["deck-cards", deckId],
    queryFn: () => apiClient.deckCards(deckId as string, token as string),
    enabled: Boolean(deckId && token),
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchOnMount: "always",
  });

  const sessionMutation = useMutation({
    mutationFn: (payload: {
      currentCardIndex: number;
      completedCards: number;
      totalCards: number;
      allCardsMode: boolean;
    }) => apiClient.updateSession(deckId as string, payload, token as string),
  });

  const resetProgressMutation = useMutation({
    mutationFn: () => apiClient.resetSessionProgress(deckId as string, token as string),
    onSuccess: () => {
      reviewedCardIdsRef.current = new Set();
      leitnerBoxesRef.current = {};
      setCompletedCount(0);
      setCurrentIndex(0);
      setSessionMode("all");
      setFlipped(false);
      setLastReview(null);
      setFadingCardId(null);

      const deckCards = deckCardsQuery.data ?? [];
      setCards(deckCards);
      setTotalCount(deckCards.length);

      if (deckCards.length > 0) {
        syncReviewRoute(deckCards[0].id);
      } else {
        syncReviewRoute(null);
      }

      void sessionQuery.refetch();
      void dueCardsQuery.refetch();
      void deckCardsQuery.refetch();
    },
  });

  useEffect(() => {
    setCards([]);
    setCurrentIndex(0);
    setCompletedCount(0);
    setTotalCount(0);
    setSessionMode("all");
    setSessionHydrated(false);
    setFlipped(false);
    setLastReview(null);
    setFadingCardId(null);
    reviewedCardIdsRef.current = new Set();
    leitnerBoxesRef.current = {};
    sawInitialDuePayloadRef.current = false;
    startedWithoutCardsRef.current = false;
    skipNextSessionPersistRef.current = true;
    lastPersistedSessionKeyRef.current = "";
  }, [deckId]);

  useEffect(() => {
    if (!sessionQuery.data || sessionHydrated) {
      return;
    }

    const completedCardIds = sessionQuery.data.completedCardIds ?? [];
    reviewedCardIdsRef.current = new Set(completedCardIds);
    const nextBoxes: Record<string, LeitnerBox> = {};
    for (const completedId of completedCardIds) {
      nextBoxes[completedId] = 4;
    }
    leitnerBoxesRef.current = nextBoxes;
    setCurrentIndex(Math.max(0, sessionQuery.data.currentCardIndex));
    setCompletedCount(Math.max(0, completedCardIds.length));
    setTotalCount(Math.max(0, sessionQuery.data.totalCards));
    setSessionMode(sessionQuery.data.allCardsMode ? "all" : "due");
    setSessionHydrated(true);
    skipNextSessionPersistRef.current = true;
  }, [sessionQuery.data, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated || !deckCardsQuery.data) {
      return;
    }

    const discoveredTotalCards = deckCardsQuery.data.length;
    setTotalCount(discoveredTotalCards);
    setCompletedCount((previous) => Math.min(previous, discoveredTotalCards));
  }, [deckCardsQuery.data, sessionHydrated]);

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
        const visibleCards = deckCardsQuery.data.filter((card) => !reviewedCardIdsRef.current.has(card.id));
        return visibleCards.length > 0 ? visibleCards : previous;
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

    const boxes = leitnerBoxesRef.current;
    for (const card of cards) {
      if (boxes[card.id] == null) {
        boxes[card.id] = 1;
      }
    }

    setCurrentIndex((previous) => Math.min(previous, cards.length - 1));
  }, [cards]);

  useEffect(() => {
    if (!sessionHydrated || cards.length === 0 || !cardId) {
      return;
    }

    const routeIndex = cards.findIndex((card) => card.id === cardId);
    if (routeIndex >= 0 && routeIndex !== currentIndexRef.current) {
      setCurrentIndex(routeIndex);
      setFlipped(false);
    }
  }, [sessionHydrated, cards, cardId]);

  useEffect(() => {
    if (!sessionHydrated || !deckId) {
      return;
    }

    if (cards.length === 0) {
      if (cardId) {
        syncReviewRoute(null);
      }
      return;
    }

    const nextCard = cards[currentIndex] ?? cards[0];
    if (!nextCard) {
      return;
    }

    if (cardId !== nextCard.id) {
      syncReviewRoute(nextCard.id);
    }
  }, [sessionHydrated, deckId, cards, currentIndex, cardId, syncReviewRoute]);

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
    onSuccess: async (response, variables) => {
      triggerGradeAnimation(variables.grade, response.mastered);
      setLastReview(response);
      setFlipped(false);

      const previousCards = cardsRef.current;
      const currentCard = previousCards.find((card) => card.id === variables.cardId);

      if (!currentCard) {
        queryClient.invalidateQueries({ queryKey: ["decks"] });
        queryClient.invalidateQueries({ queryKey: ["due-cards", deckId] });
        queryClient.invalidateQueries({ queryKey: ["deck-cards", deckId] });
        return;
      }

      const currentBox = leitnerBoxesRef.current[currentCard.id] ?? 1;
      const nextBox = nextLeitnerBox(currentBox, variables.grade);
      const shouldComplete = nextBox >= 4;
      leitnerBoxesRef.current[currentCard.id] = nextBox;

      if (shouldComplete) {
        setFadingCardId(variables.cardId);
        await new Promise((resolve) => setTimeout(resolve, CARD_FADE_MS));
        setFadingCardId(null);
        reviewedCardIdsRef.current.add(variables.cardId);
        delete leitnerBoxesRef.current[currentCard.id];
      } else {
        reviewedCardIdsRef.current.delete(variables.cardId);
      }

      const discoveredTotal = deckCardsQuery.data?.length ?? 0;
      const nextTotal = discoveredTotal > 0
        ? discoveredTotal
        : Math.max(totalCountRef.current, previousCards.length);
      const nextCompleted = shouldComplete
        ? Math.min(completedCountRef.current + 1, Math.max(nextTotal, 1))
        : completedCountRef.current;

      if (shouldComplete) {
        const remainingCards = previousCards.filter((card) => card.id !== variables.cardId);

        if (nextTotal > 0 && nextCompleted >= nextTotal) {
          setCards([]);
          setCurrentIndex(0);
          setCompletedCount(nextTotal);
          setTotalCount(nextTotal);
          queryClient.invalidateQueries({ queryKey: ["decks"] });
          queryClient.invalidateQueries({ queryKey: ["due-cards", deckId] });
          queryClient.invalidateQueries({ queryKey: ["deck-cards", deckId] });
          resetProgressMutation.mutate();
          return;
        }

        setCards(remainingCards);
        setCurrentIndex((index) => Math.min(index, Math.max(remainingCards.length - 1, 0)));
      } else {
        const remainingCards = previousCards.filter((card) => card.id !== variables.cardId);
        const reinsertIndex = computeLeitnerReinsertIndex(
          nextBox,
          currentIndexRef.current,
          remainingCards.length
        );
        const nextCards = [
          ...remainingCards.slice(0, reinsertIndex),
          currentCard,
          ...remainingCards.slice(reinsertIndex),
        ];

        setCards(nextCards);
        setCurrentIndex(Math.min(currentIndexRef.current, Math.max(nextCards.length - 1, 0)));
      }

      setCompletedCount(nextCompleted);
      setTotalCount(nextTotal);
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["due-cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["deck-cards", deckId] });
    },
  });

  const currentCard = cards[currentIndex] ?? null;
  const effectiveTotalCount = deckCardsQuery.data?.length ?? totalCount;
  const remainingCount = Math.max(effectiveTotalCount - completedCount, 0);
  const progressPercent = effectiveTotalCount === 0 ? 0 : Math.min(100, (completedCount / effectiveTotalCount) * 100);
  const badge = difficultyBadge(lastReview);

  const gradeButtons = useMemo(() => [1, 2, 3, 4, 5], []);
  const canMoveBack = currentIndex > 0;
  const canMoveForward = currentIndex < cards.length - 1;

  if (sessionQuery.isLoading || !sessionHydrated) {
    return <section className="surface">Loading review session...</section>;
  }

  if (!currentCard) {
    const hasReachedHundred = effectiveTotalCount > 0 && completedCount >= effectiveTotalCount;
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
        <p>Completed: {completedCount} | Remaining: {remainingCount}</p>
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
            <button
              className="button-main"
              onClick={() => resetProgressMutation.mutate()}
              disabled={resetProgressMutation.isPending}
            >
              {resetProgressMutation.isPending ? "Restarting..." : "Restart Deck"}
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
        <p>Progress: {progressPercent.toFixed(1)}% ({completedCount}/{effectiveTotalCount || 0})</p>
        <p>Completed: {completedCount} | Remaining: {remainingCount}</p>
        <p>Mode: {sessionMode === "all" ? "All cards" : "Due cards"}</p>
        <p>Scheduling: SM-2 grading + Leitner review queue</p>
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

      <section className={`surface review-card-surface ${gradeEffectClass}`}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.8rem" }}>
          <button className="button-alt" onClick={goPrevious} disabled={!canMoveBack || reviewMutation.isPending}>
            ← Previous
          </button>
          <button className="button-alt" onClick={goNext} disabled={!canMoveForward || reviewMutation.isPending}>
            Next →
          </button>
        </div>

        <div className={`review-card-stage ${currentCard.id === fadingCardId ? "card-fade-out" : ""}`}>
          <CardFlip
            front={currentCard.front}
            back={currentCard.back}
            flipped={flipped}
            onToggle={() => setFlipped((value) => !value)}
          />
        </div>
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

        {gradeReaction && <p className={`grade-reaction ${gradeEffectClass}`}>{gradeReaction}</p>}

        {lastReview && (
          <p>
            Next review: {lastReview.nextReviewDate} | Interval: {lastReview.intervalDays} day(s) | EF: {lastReview.easinessFactor.toFixed(2)}
          </p>
        )}
      </section>

      {(dueCardsQuery.isError || deckCardsQuery.isError || sessionQuery.isError || reviewMutation.isError || sessionMutation.isError || resetProgressMutation.isError) && (
        <section className="surface" style={{ color: "#b91c1c" }}>
          {(dueCardsQuery.error as Error)?.message ||
            (deckCardsQuery.error as Error)?.message ||
            (sessionQuery.error as Error)?.message ||
            (sessionMutation.error as Error)?.message ||
            (resetProgressMutation.error as Error)?.message ||
            (reviewMutation.error as Error)?.message}
        </section>
      )}
    </div>
  );
}
