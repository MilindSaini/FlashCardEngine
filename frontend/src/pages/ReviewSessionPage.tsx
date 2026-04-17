import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiClient } from "../api/client";
import { DueCard, ReviewResponse } from "../api/types";
import { CardFlip } from "../components/CardFlip";
import { useAuthStore } from "../store/authStore";
import { isValidUuid, validateReviewGrade } from "../types/validation";

type SessionMode = "due" | "all";
type GradeEffectClass = "" | "grade-hit-1" | "grade-hit-2" | "grade-hit-3" | "grade-hit-4" | "grade-hit-5";
type LeitnerBox = 1 | 2 | 3 | 4 | 5;

const FIRST_ARRIVAL_REFRESH_KEY_PREFIX = "review-first-arrival-refreshed:";
const CARD_FADE_MS = 240;
const PROGRESS_MILESTONES = [25, 50, 75, 100] as const;

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

function sessionFocusMessage(mastered: number, shaky: number, upcoming: number) {
  if (mastered > 0 && shaky === 0 && upcoming === 0) {
    return "Excellent run. You are in a strong retention zone today.";
  }

  if (shaky > 0) {
    return `You have ${shaky} shaky cards. Small, focused passes will stabilize memory quickly.`;
  }

  if (upcoming > 0) {
    return `${upcoming} cards are coming up for review. Keep a steady pace and finish the queue.`;
  }

  return "Steady progress. Keep the rhythm with short, consistent review sessions.";
}

function milestoneMessage(milestone: number) {
  if (milestone >= 100) {
    return "100% reached. Full cycle complete.";
  }
  return `${milestone}% milestone reached. Keep going.`;
}

export function ReviewSessionPage() {
  const token = useAuthStore((state) => state.token);
  const { deckId, cardId } = useParams<{ deckId: string; cardId?: string }>();
  const hasValidDeckId = isValidUuid(deckId);
  const routeCardId = cardId && isValidUuid(cardId) ? cardId : null;
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
  const [milestoneNotice, setMilestoneNotice] = useState<{ percent: number; message: string } | null>(null);
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
  const milestoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievedMilestonesRef = useRef<Set<number>>(new Set());
  const milestoneBaselineInitializedRef = useRef(false);
  const queryClient = useQueryClient();

  const triggerMilestoneCelebration = (milestone: number) => {
    if (milestoneTimeoutRef.current) {
      clearTimeout(milestoneTimeoutRef.current);
      milestoneTimeoutRef.current = null;
    }

    setMilestoneNotice({ percent: milestone, message: milestoneMessage(milestone) });

    const particles = milestone >= 100 ? 60 : 36;
    const velocity = milestone >= 100 ? 38 : 24;
    confetti({
      particleCount: particles,
      spread: 44,
      startVelocity: velocity,
      gravity: 1.1,
      scalar: 0.8,
      ticks: 140,
      origin: { x: 0.5, y: 0.74 },
      colors: ["#14b8a6", "#2dd4bf", "#f59e0b", "#ff5e2c"],
    });

    milestoneTimeoutRef.current = setTimeout(() => {
      setMilestoneNotice(null);
    }, 2400);
  };

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
      if (!deckId || !hasValidDeckId) {
        return;
      }

      const nextPath = nextCardId ? `/review/${deckId}/${nextCardId}` : `/review/${deckId}`;
      navigate(nextPath, { replace });
    },
    [deckId, hasValidDeckId, navigate]
  );

  useEffect(() => {
    if (!deckId || hasValidDeckId) {
      return;
    }

    toast.error("Invalid deck link. Please open the deck again from dashboard.", { id: "invalid-review-deck" });
  }, [deckId, hasValidDeckId]);

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
      if (milestoneTimeoutRef.current) {
        clearTimeout(milestoneTimeoutRef.current);
      }
    };
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["deck-session", deckId],
    queryFn: () => apiClient.getSession(deckId as string, token as string),
    enabled: Boolean(deckId && token && hasValidDeckId),
    refetchOnMount: "always",
  });

  const dueCardsQuery = useQuery({
    queryKey: ["due-cards", deckId],
    queryFn: () => apiClient.dueCards(deckId as string, token as string),
    enabled: Boolean(deckId && token && hasValidDeckId),
    refetchInterval: sessionMode === "due" ? 5000 : 15000,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchOnMount: "always",
  });

  const deckCardsQuery = useQuery({
    queryKey: ["deck-cards", deckId],
    queryFn: () => apiClient.deckCards(deckId as string, token as string),
    enabled: Boolean(deckId && token && hasValidDeckId),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchOnMount: "always",
  });

  const deckSummaryQuery = useQuery({
    queryKey: ["decks"],
    queryFn: () => apiClient.listDecks(token as string),
    enabled: Boolean(token),
    refetchOnMount: "always",
    refetchIntervalInBackground: false,
  });

  const sessionMutation = useMutation({
    mutationFn: (payload: {
      currentCardIndex: number;
      completedCards: number;
      totalCards: number;
      allCardsMode: boolean;
    }) => {
      if (!deckId || !hasValidDeckId) {
        throw new Error("Invalid deck reference.");
      }
      return apiClient.updateSession(deckId, payload, token as string);
    },
  });

  const resetProgressMutation = useMutation({
    mutationFn: () => {
      if (!deckId || !hasValidDeckId) {
        throw new Error("Invalid deck reference.");
      }
      return apiClient.resetSessionProgress(deckId, token as string);
    },
    onSuccess: () => {
      toast.success("Deck progress restarted.");
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
      queryClient.invalidateQueries({ queryKey: ["my-streak"] });
    },
    onError: () => {
      toast.error("Could not restart deck progress right now.", { id: "review-reset-error" });
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
    achievedMilestonesRef.current = new Set();
    milestoneBaselineInitializedRef.current = false;
    setMilestoneNotice(null);
    if (milestoneTimeoutRef.current) {
      clearTimeout(milestoneTimeoutRef.current);
      milestoneTimeoutRef.current = null;
    }
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
    setSessionMode(routeCardId ? "all" : sessionQuery.data.allCardsMode ? "all" : "due");
    setSessionHydrated(true);
    skipNextSessionPersistRef.current = true;
  }, [sessionQuery.data, sessionHydrated, routeCardId]);

  useEffect(() => {
    if (!sessionHydrated || !deckCardsQuery.data) {
      return;
    }

    const discoveredTotalCards = deckCardsQuery.data.length;
    setTotalCount(discoveredTotalCards);
    setCompletedCount((previous) => Math.min(previous, discoveredTotalCards));
  }, [deckCardsQuery.data, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated || sessionMode !== "due" || Boolean(routeCardId) || !dueCardsQuery.data) {
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
  }, [dueCardsQuery.data, deckId, sessionHydrated, sessionMode, routeCardId]);

  useEffect(() => {
    if (!sessionHydrated || sessionMode !== "all" || !deckCardsQuery.data) {
      return;
    }

    setCards((previous) => {
      if (previous.length === 0) {
        const visibleCards = deckCardsQuery.data.filter(
          (card) => card.id === routeCardId || !reviewedCardIdsRef.current.has(card.id)
        );
        return visibleCards.length > 0 ? visibleCards : previous;
      }

      const existingIds = new Set(previous.map((card) => card.id));
      const merged = [...previous];
      let hasNewCard = false;

      for (const incoming of deckCardsQuery.data) {
        if (
          existingIds.has(incoming.id) ||
          (incoming.id !== routeCardId && reviewedCardIdsRef.current.has(incoming.id))
        ) {
          continue;
        }
        merged.push(incoming);
        existingIds.add(incoming.id);
        hasNewCard = true;
      }

      return hasNewCard ? merged : previous;
    });
  }, [deckCardsQuery.data, sessionHydrated, sessionMode, routeCardId]);

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
      const waitingForDeckCards = deckCardsQuery.isLoading || deckCardsQuery.isFetching;
      const waitingForDueCards = sessionMode === "due" && (dueCardsQuery.isLoading || dueCardsQuery.isFetching);
      if (waitingForDeckCards || waitingForDueCards) {
        return;
      }

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
  }, [
    sessionHydrated,
    deckId,
    cards,
    currentIndex,
    cardId,
    syncReviewRoute,
    deckCardsQuery.isLoading,
    deckCardsQuery.isFetching,
    dueCardsQuery.isLoading,
    dueCardsQuery.isFetching,
    sessionMode,
  ]);

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
    mutationFn: ({ cardId, grade }: { cardId: string; grade: number }) => {
      const gradeError = validateReviewGrade(grade);
      if (gradeError) {
        throw new Error(gradeError);
      }
      return apiClient.submitReview(cardId, grade, token as string);
    },
    onSuccess: async (response, variables) => {
      triggerGradeAnimation(variables.grade, response.mastered);
      setLastReview(response);
      setFlipped(false);

      const previousCards = cardsRef.current;
      const currentCard = previousCards.find((card) => card.id === variables.cardId);

      if (!currentCard) {
        queryClient.invalidateQueries({ queryKey: ["decks"] });
        void queryClient.refetchQueries({ queryKey: ["decks"], type: "active" });
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
          void queryClient.refetchQueries({ queryKey: ["decks"], type: "active" });
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
      queryClient.invalidateQueries({ queryKey: ["my-streak"] });
      void queryClient.refetchQueries({ queryKey: ["decks"], type: "active" });
    },
    onError: () => {
      toast.error("Review could not be submitted. Please try again.", { id: "review-submit-error" });
    },
  });

  const currentCard = cards[currentIndex] ?? null;
  const effectiveTotalCount = deckCardsQuery.data?.length ?? totalCount;
  const remainingCount = Math.max(effectiveTotalCount - completedCount, 0);
  const progressPercent = effectiveTotalCount === 0 ? 0 : Math.min(100, (completedCount / effectiveTotalCount) * 100);
  const badge = difficultyBadge(lastReview);
  const currentDeckSummary = deckSummaryQuery.data?.find((deck) => deck.id === deckId);
  const masteredSnapshot = currentDeckSummary?.masteredCards ?? completedCount;
  const shakySnapshot = currentDeckSummary?.shakyCards ?? 0;
  const upcomingSnapshot = currentDeckSummary?.dueToday ?? remainingCount;
  const focusMessage = sessionFocusMessage(masteredSnapshot, shakySnapshot, upcomingSnapshot);

  const reviewErrorText = reviewMutation.isError
    ? "Review submission failed. Please try again."
    : resetProgressMutation.isError
      ? "Could not restart this deck right now."
      : sessionQuery.isError
        ? "Session data could not be loaded. Please refresh."
        : dueCardsQuery.isError
          ? "Due-card updates are temporarily unavailable."
          : deckCardsQuery.isError
            ? "Deck cards are not available right now."
            : deckSummaryQuery.isError
              ? "Progress snapshot is temporarily unavailable."
              : sessionMutation.isError
                ? "Session state could not be saved."
                : null;

  useEffect(() => {
    if (!reviewErrorText) {
      return;
    }
    toast.error(reviewErrorText, { id: "review-page-error" });
  }, [reviewErrorText]);

  useEffect(() => {
    if (!sessionHydrated || effectiveTotalCount <= 0 || milestoneBaselineInitializedRef.current) {
      return;
    }

    const baselineMilestones = new Set<number>();
    for (const threshold of PROGRESS_MILESTONES) {
      if (progressPercent >= threshold) {
        baselineMilestones.add(threshold);
      }
    }
    achievedMilestonesRef.current = baselineMilestones;
    milestoneBaselineInitializedRef.current = true;
  }, [sessionHydrated, effectiveTotalCount, progressPercent]);

  useEffect(() => {
    if (!sessionHydrated || effectiveTotalCount <= 0 || !milestoneBaselineInitializedRef.current) {
      return;
    }

    for (const threshold of PROGRESS_MILESTONES) {
      if (progressPercent >= threshold && !achievedMilestonesRef.current.has(threshold)) {
        achievedMilestonesRef.current.add(threshold);
        triggerMilestoneCelebration(threshold);
      }
    }
  }, [effectiveTotalCount, progressPercent, sessionHydrated]);

  const gradeButtons = useMemo(() => [1, 2, 3, 4, 5], []);
  const canMoveBack = currentIndex > 0;
  const canMoveForward = currentIndex < cards.length - 1;

  const submitGrade = (grade: number) => {
    const gradeError = validateReviewGrade(grade);
    if (gradeError) {
      toast.error(gradeError, { id: "review-grade-validation" });
      return;
    }

    if (!currentCard || !isValidUuid(currentCard.id)) {
      toast.error("Current card is invalid. Please refresh the session.", { id: "review-card-validation" });
      return;
    }

    reviewMutation.mutate({ cardId: currentCard.id, grade });
  };

  if (deckId && cardId && !isValidUuid(cardId)) {
    return <section className="surface review-state">Invalid card link. Open the deck again from dashboard.</section>;
  }

  if (sessionQuery.isLoading || !sessionHydrated) {
    return <section className="surface review-state">Loading review session...</section>;
  }

  if (!currentCard) {
    const hasReachedHundred = effectiveTotalCount > 0 && completedCount >= effectiveTotalCount;
    const waitingOnDueCards = sessionMode === "due" && dueCardsQuery.isFetching;
    const waitingOnDeckCards = deckCardsQuery.isFetching;

    const title = hasReachedHundred ? "Deck Completed" : "Waiting For Cards";
    const message = hasReachedHundred
      ? "Progress hit 100%. Your cycle is saved. Click Restart Deck when you want a fresh pass."
      : "No cards are visible right now. If PDF ingestion is running, cards will appear automatically.";

    return (
      <section className="surface review-empty-state">
        <h2>{title}</h2>
        <p>{message}</p>
        {milestoneNotice && (
          <div className="milestone-banner" role="status" aria-live="polite">
            <span className="milestone-badge">{milestoneNotice.percent}%</span>
            <span>{milestoneNotice.message}</span>
          </div>
        )}
        <div className="session-snapshot-grid" role="list" aria-label="Review readiness snapshot">
          <article className="session-snapshot-card mastered" role="listitem">
            <span className="session-snapshot-label">Mastered</span>
            <strong className="session-snapshot-value">{masteredSnapshot}</strong>
          </article>
          <article className="session-snapshot-card shaky" role="listitem">
            <span className="session-snapshot-label">Shaky</span>
            <strong className="session-snapshot-value">{shakySnapshot}</strong>
          </article>
          <article className="session-snapshot-card upcoming" role="listitem">
            <span className="session-snapshot-label">Coming Up</span>
            <strong className="session-snapshot-value">{upcomingSnapshot}</strong>
          </article>
        </div>
        <p className="session-motivation">{focusMessage}</p>
        <p>Completed: {completedCount} | Remaining: {remainingCount}</p>
        <p>{waitingOnDueCards || waitingOnDeckCards ? "Syncing latest cards..." : "Use Refresh if you want to force-check now."}</p>
        <div className="row review-empty-actions">
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
    <div className="grid review-page">
      <section className="surface review-overview">
        <p className="review-kicker">Adaptive Practice Loop</p>
        <h1>Review Session</h1>
        {milestoneNotice && (
          <div className="milestone-banner" role="status" aria-live="polite">
            <span className="milestone-badge">{milestoneNotice.percent}%</span>
            <span>{milestoneNotice.message}</span>
          </div>
        )}
        <div className="session-snapshot-grid" role="list" aria-label="Review progress snapshot">
          <article className="session-snapshot-card mastered" role="listitem">
            <span className="session-snapshot-label">Mastered</span>
            <strong className="session-snapshot-value">{masteredSnapshot}</strong>
          </article>
          <article className="session-snapshot-card shaky" role="listitem">
            <span className="session-snapshot-label">Shaky</span>
            <strong className="session-snapshot-value">{shakySnapshot}</strong>
          </article>
          <article className="session-snapshot-card upcoming" role="listitem">
            <span className="session-snapshot-label">Coming Up</span>
            <strong className="session-snapshot-value">{upcomingSnapshot}</strong>
          </article>
        </div>
        <p className="session-motivation">{focusMessage}</p>
        <p>Progress: {progressPercent.toFixed(1)}% ({completedCount}/{effectiveTotalCount || 0})</p>
        <p>Completed: {completedCount} | Remaining: {remainingCount}</p>
        <p>Mode: {sessionMode === "all" ? "All cards" : "Due cards"}</p>
        <p>Scheduling: SM-2 grading + Leitner review queue</p>
        <p>{dueCardsQuery.isFetching ? "Checking for new generated cards..." : "Live queue updates are active."}</p>
        <div className="review-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
          <div
            className="review-progress-fill"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </section>

      <section className={`surface review-card-surface review-card-panel ${gradeEffectClass}`}>
        <div className="row review-nav-row">
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

      <section className="surface grid review-grading-panel">
        <div className="row review-grade-head">
          <strong>Grade Recall (0-5)</strong>
          <span className={badge.className}>
            {badge.icon} {badge.label}
          </span>
        </div>

        <div className="grade-grid">
          {gradeButtons.map((grade) => (
            <button
              key={grade}
              onClick={() => submitGrade(grade)}
              disabled={reviewMutation.isPending}
            >
              {grade}
            </button>
          ))}
        </div>

        {gradeReaction && <p className={`grade-reaction ${gradeEffectClass}`}>{gradeReaction}</p>}

        {lastReview && (
          <p className="review-last-result">
            Next review: {lastReview.nextReviewDate} | Interval: {lastReview.intervalDays} day(s) | EF: {lastReview.easinessFactor.toFixed(2)}
          </p>
        )}
      </section>

      {reviewErrorText && (
        <section className="surface review-error-panel">
          {reviewErrorText}
        </section>
      )}
    </div>
  );
}
