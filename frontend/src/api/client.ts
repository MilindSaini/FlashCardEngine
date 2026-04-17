import {
  AuthResponse,
  DeckDeleteResponse,
  DeckAnalytics,
  DeckSummary,
  DueCard,
  ReviewResponse,
  SearchResponse,
  SessionState,
  UserStreakStats,
} from "./types";
import {
  isValidUuid,
  normalizeDeckTitle,
  normalizeEmail,
  normalizeSearchQuery,
  validateDeckTitle,
  validateEmail,
  validateNonNegativeInteger,
  validatePassword,
  validatePdfFile,
  validateReviewGrade,
  validateSearchQuery,
} from "../types/validation";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

function assertToken(token: string | null | undefined) {
  if (!token || !token.trim()) {
    throw new Error("You are not authenticated. Please log in again.");
  }
  return token;
}

function assertUuid(value: string, label: string) {
  const normalized = value.trim();
  if (!isValidUuid(normalized)) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized;
}

function parseResponseBody<T>(responseText: string): T {
  if (!responseText) {
    throw new Error("Received an empty response from the server.");
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error("Received an unexpected response from the server.");
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Network error. Please check your connection and try again.");
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}). Please try again.`);
  }

  return parseResponseBody<T>(responseText);
}

export const apiClient = {
  signup: (email: string, password: string) => {
    const emailError = validateEmail(email);
    if (emailError) {
      throw new Error(emailError);
    }

    const passwordError = validatePassword(password, "signup");
    if (passwordError) {
      throw new Error(passwordError);
    }

    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: normalizeEmail(email), password }),
    });
  },

  login: (email: string, password: string) => {
    const emailError = validateEmail(email);
    if (emailError) {
      throw new Error(emailError);
    }

    const passwordError = validatePassword(password, "login");
    if (passwordError) {
      throw new Error(passwordError);
    }

    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalizeEmail(email), password }),
    });
  },

  listDecks: (token: string) => request<DeckSummary[]>("/api/decks", {}, assertToken(token)),

  deleteDeck: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<DeckDeleteResponse>(
      `/api/decks/${encodeURIComponent(normalizedDeckId)}`,
      {
        method: "DELETE",
      },
      assertToken(token)
    );
  },

  createDeck: (title: string, token: string) => {
    const titleError = validateDeckTitle(title);
    if (titleError) {
      throw new Error(titleError);
    }

    return request<DeckSummary>(
      "/api/decks",
      {
        method: "POST",
        body: JSON.stringify({ title: normalizeDeckTitle(title) }),
      },
      assertToken(token)
    );
  },

  uploadPdf: async (deckId: string, file: File, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    const fileError = validatePdfFile(file);
    if (fileError) {
      throw new Error(fileError);
    }

    const formData = new FormData();
    formData.append("deckId", normalizedDeckId);
    formData.append("file", file);

    return request<{ file_key: string; status: string; message: string }>(
      `/api/ingestion/upload?deckId=${encodeURIComponent(normalizedDeckId)}`,
      {
        method: "POST",
        body: formData,
      },
      assertToken(token)
    );
  },

  dueCards: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<DueCard[]>(`/api/decks/${encodeURIComponent(normalizedDeckId)}/due-cards`, {}, assertToken(token));
  },

  deckCards: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<DueCard[]>(`/api/decks/${encodeURIComponent(normalizedDeckId)}/cards`, {}, assertToken(token));
  },

  submitReview: (cardId: string, grade: number, token: string) => {
    const normalizedCardId = assertUuid(cardId, "card id");
    const gradeError = validateReviewGrade(grade);
    if (gradeError) {
      throw new Error(gradeError);
    }

    return request<ReviewResponse>(
      `/api/cards/${encodeURIComponent(normalizedCardId)}/review`,
      {
        method: "POST",
        body: JSON.stringify({ grade }),
      },
      assertToken(token)
    );
  },

  getSession: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<SessionState>(`/api/decks/${encodeURIComponent(normalizedDeckId)}/session`, {}, assertToken(token));
  },

  updateSession: (
    deckId: string,
    payload: {
      currentCardIndex: number;
      completedCards: number;
      totalCards: number;
      allCardsMode: boolean;
    },
    token: string
  ) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    const currentCardIndexError = validateNonNegativeInteger(payload.currentCardIndex, "Current card index");
    if (currentCardIndexError) {
      throw new Error(currentCardIndexError);
    }

    const completedCardsError = validateNonNegativeInteger(payload.completedCards, "Completed cards");
    if (completedCardsError) {
      throw new Error(completedCardsError);
    }

    const totalCardsError = validateNonNegativeInteger(payload.totalCards, "Total cards");
    if (totalCardsError) {
      throw new Error(totalCardsError);
    }

    return request<SessionState>(
      `/api/decks/${encodeURIComponent(normalizedDeckId)}/session`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      assertToken(token)
    );
  },

  resetSessionProgress: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<SessionState>(
      `/api/decks/${encodeURIComponent(normalizedDeckId)}/session/progress`,
      {
        method: "DELETE",
      },
      assertToken(token)
    );
  },

  analytics: (deckId: string, token: string) => {
    const normalizedDeckId = assertUuid(deckId, "deck id");
    return request<DeckAnalytics>(`/api/analytics/decks/${encodeURIComponent(normalizedDeckId)}`, {}, assertToken(token));
  },

  getMyStreak: (token: string) => request<UserStreakStats>("/api/users/me/streak", {}, assertToken(token)),

  search: (query: string, mode: "fulltext" | "semantic", token: string, deckId?: string) => {
    const normalizedQuery = normalizeSearchQuery(query).trim();
    const searchValidationError = validateSearchQuery(normalizedQuery);
    if (searchValidationError) {
      throw new Error(searchValidationError);
    }

    if (!normalizedQuery) {
      throw new Error("Search query cannot be empty.");
    }

    if (mode !== "fulltext" && mode !== "semantic") {
      throw new Error("Invalid search mode.");
    }

    const deck = deckId
      ? `&deckId=${encodeURIComponent(assertUuid(deckId, "deck id"))}`
      : "";

    return request<SearchResponse>(
      `/api/search?q=${encodeURIComponent(normalizedQuery)}&mode=${mode}${deck}`,
      {},
      assertToken(token)
    );
  },
};
