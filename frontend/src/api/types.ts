export type AuthResponse = {
  token: string;
  userId: string;
  email: string;
};

export type DeckSummary = {
  id: string;
  title: string;
  lastReviewedAt: string | null;
  createdAt: string;
  totalCards: number;
  masteredCards: number;
  shakyCards: number;
  dueToday: number;
  masteryPercent: number;
};

export type DueCard = {
  id: string;
  type: "QA" | "DEFINITION" | "RELATION" | "EDGE_CASE" | "EXAMPLE";
  front: string;
  back: string;
};

export type ReviewResponse = {
  cardId: string;
  grade: number;
  easinessFactor: number;
  intervalDays: number;
  repetitionCount: number;
  averageGrade: number;
  nextReviewDate: string;
  mastered: boolean;
  shaky: boolean;
};

export type SessionState = {
  deckId: string;
  currentCardIndex: number;
  completedCards: number;
  totalCards: number;
  allCardsMode: boolean;
  deckCycleCompleted: boolean;
  completedCardIds: string[];
  lastAccessed: string;
};

export type DeckAnalytics = {
  deckId: string;
  masteredCards: number;
  shakyCards: number;
  dueToday: number;
  heatmap: Array<{ date: string; reviews: number }>;
  decayCurve: Array<{ day: number; retention: number }>;
  conceptGraph: {
    nodes: Array<{ id: string }>;
    links: Array<{ source: string; target: string; label: string }>;
  };
};

export type SearchCardResult = {
  cardId: string;
  deckId: string;
  type: "QA" | "DEFINITION" | "RELATION" | "EDGE_CASE" | "EXAMPLE";
  front: string;
  back: string;
  score: number;
};

export type SearchResponse = {
  mode: string;
  query: string;
  results: SearchCardResult[];
};
