import {
  AuthResponse,
  DeckAnalytics,
  DeckSummary,
  DueCard,
  ReviewResponse,
  SearchResponse,
  SessionState,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  signup: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  listDecks: (token: string) => request<DeckSummary[]>("/api/decks", {}, token),

  createDeck: (title: string, token: string) =>
    request<DeckSummary>(
      "/api/decks",
      {
        method: "POST",
        body: JSON.stringify({ title }),
      },
      token
    ),

  uploadPdf: async (deckId: string, file: File, token: string) => {
    const formData = new FormData();
    formData.append("deckId", deckId);
    formData.append("file", file);

    return request<{ file_key: string; status: string; message: string }>(
      `/api/ingestion/upload?deckId=${deckId}`,
      {
        method: "POST",
        body: formData,
      },
      token
    );
  },

  dueCards: (deckId: string, token: string) =>
    request<DueCard[]>(`/api/decks/${deckId}/due-cards`, {}, token),

  deckCards: (deckId: string, token: string) =>
    request<DueCard[]>(`/api/decks/${deckId}/cards`, {}, token),

  submitReview: (cardId: string, grade: number, token: string) =>
    request<ReviewResponse>(
      `/api/cards/${cardId}/review`,
      {
        method: "POST",
        body: JSON.stringify({ grade }),
      },
      token
    ),

  getSession: (deckId: string, token: string) =>
    request<SessionState>(`/api/decks/${deckId}/session`, {}, token),

  updateSession: (
    deckId: string,
    payload: {
      currentCardIndex: number;
      completedCards: number;
      totalCards: number;
      allCardsMode: boolean;
    },
    token: string
  ) =>
    request<SessionState>(
      `/api/decks/${deckId}/session`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      token
    ),

  resetSessionProgress: (deckId: string, token: string) =>
    request<SessionState>(
      `/api/decks/${deckId}/session/progress`,
      {
        method: "DELETE",
      },
      token
    ),

  analytics: (deckId: string, token: string) =>
    request<DeckAnalytics>(`/api/analytics/decks/${deckId}`, {}, token),

  search: (query: string, mode: "fulltext" | "semantic", token: string, deckId?: string) => {
    const deck = deckId ? `&deckId=${deckId}` : "";
    return request<SearchResponse>(
      `/api/search?q=${encodeURIComponent(query)}&mode=${mode}${deck}`,
      {},
      token
    );
  },
};
