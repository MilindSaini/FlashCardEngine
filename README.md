# FlashCardEngine

FlashCardEngine is a full-stack AI-assisted flashcard platform for building durable memory through spaced repetition, structured review sessions, semantic search, and concept-graph analytics.

It combines:

- A React + TypeScript frontend for an interactive study workflow.
- A Spring Boot backend with JWT auth and user-scoped data isolation.
- PostgreSQL (with pgvector and full-text search) for persistence and retrieval.
- Cloudflare R2 for PDF storage.
- Optional Gemini-powered extraction with robust heuristic fallback.

## What This Project Can Do

- Create and manage user-owned decks.
- Upload PDF files and asynchronously generate flashcards.
- Track ingestion progress in real time (queued, processing, completed, failed).
- Run SM-2 review scheduling per card.
- Persist deck session progress and per-card completion state.
- Support both full-text and semantic card search.
- Expose deck analytics (mastered, shaky, due, concept graph).
- Track user streak and learning activity metrics.

## Architecture Overview

### Runtime Components

- Frontend: React, Vite, TypeScript, React Query, Zustand.
- Backend: Spring Boot 3.3.x, Spring Security, JPA, Flyway.
- Database: PostgreSQL + pgvector extension + tsvector index.
- Object Storage: Cloudflare R2 (S3-compatible API).

### High-Level Data Flow

1. Frontend calls backend REST endpoints with Bearer JWT.
2. Backend validates JWT and resolves current user identity.
3. Services enforce user ownership on deck/card/session access.
4. Backend reads/writes PostgreSQL and updates analytics/search data.
5. Ingestion uploads PDFs to R2, emits async event, and processes in background.
6. Frontend polls ingestion job endpoint to render live status in UI.

## Backend Functioning (Professional Deep Dive)

### 1) Security and Identity

- Stateless JWT authentication is enforced for all API routes except auth and health.
- JWT subject is the user UUID, used as the authenticated principal.
- Every domain service receives current user UUID and validates ownership before reads/writes.

Behavior summary:

- Public routes: `/api/auth/**`, `/actuator/health`.
- Protected routes: all other `/api/**` endpoints.
- Authorization model: user-scoped resource access only.

### 2) Deck and Card Domain

- Decks are user-owned and cascade delete related cards and progress data.
- Card types include `QA`, `DEFINITION`, `RELATION`, `EDGE_CASE`, `EXAMPLE`.
- Review-facing card retrieval filters low-signal relation payloads and normalizes prompts for better UX.

### 3) SM-2 Review Engine

- Grades range from `0` to `5`.
- Easiness factor update:

$$
EF' = \max(1.3, EF + 0.1 - (5-q)\cdot(0.08 + (5-q)\cdot 0.02))
$$

Interval progression rules:
1. Grade < 3: repetition resets, interval = 1 day.
2. Repetition 0: interval = 1 day.
3. Repetition 1: interval = 6 days.
4. Repetition >= 2: interval = round(previousInterval * EF).

- Review submission persists updated SM-2 state, review history, session per-card progress, and streak activity.

### 4) Async Ingestion Pipeline

Ingestion is event-driven and non-blocking from the client perspective.

Pipeline stages:

1. Upload endpoint validates file and deck ownership.
2. PDF is stored in R2.
3. Ingestion job row is created with `QUEUED` status.
4. Async listener consumes `PdfUploadedEvent` and marks `PROCESSING`.
5. PDF text is extracted (PDFBox), sanitized, and chunked.
6. Per chunk, extraction runs for definitions, relationships, edge cases, and worked examples.
7. Drafts are refined, deduplicated, quality-filtered, and persisted.
8. Embeddings are generated and stored for semantic search.
9. Deck concept graph is persisted.
10. Job is marked `COMPLETED` or `FAILED` with counters and error details.

Important operational behavior:

- Gemini is optional. If unavailable or failing, heuristic fallback extraction still runs.
- Ingestion job endpoint provides machine-readable progress counters for UI polling.

### 5) Search System

- `fulltext` mode uses PostgreSQL `tsvector` + `plainto_tsquery` ranking.
- `semantic` mode uses pgvector cosine distance over stored embeddings.
- Search can be scoped to one deck or run across all user decks.
- Limits are clamped server-side to `1..50`.

### 6) Session and Learning State

- Session state stores index and aggregate counters per user+deck.
- Per-card completion is persisted separately to support robust resume behavior.
- Session endpoint returns total reviewable cards, completed card IDs, cycle completion flag, and last accessed timestamp.

### 7) Analytics and Progress Metrics

- Deck analytics returns mastered, shaky, and due counts.
- Concept graph is loaded from deck-level graph storage (or relation card fallback merge).
- Relation cards are excluded from mastery percentage denominator to avoid inflating progress.

### 8) Error Handling

- Validation failures and explicit status exceptions return a normalized JSON shape with `timestamp`, `status`, `error`, and `message`.

This makes frontend and automation handling consistent.

## API Reference

Base URL:

- Backend local: `http://localhost:8080`

Authentication:

- Protected endpoints require `Authorization: Bearer <token>`.

### Endpoint Matrix

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/signup | No | Register account, issue JWT |
| POST | /api/auth/login | No | Login, issue JWT |
| GET | /api/decks | Yes | List user decks with progress summary |
| POST | /api/decks | Yes | Create a new deck |
| DELETE | /api/decks/{deckId} | Yes | Delete deck and related data |
| POST | /api/ingestion/upload?deckId={deckId} | Yes | Upload PDF and queue async ingestion job |
| GET | /api/ingestion/jobs/{jobId} | Yes | Fetch ingestion status, stage, counters |
| GET | /api/decks/{deckId}/due-cards | Yes | Fetch due review cards |
| GET | /api/decks/{deckId}/cards | Yes | Fetch all reviewable cards in deck |
| POST | /api/cards/{cardId}/review | Yes | Submit review grade and update SM-2 state |
| GET | /api/decks/{deckId}/session | Yes | Get or initialize deck session state |
| PUT | /api/decks/{deckId}/session | Yes | Update current session position/mode |
| DELETE | /api/decks/{deckId}/session/progress | Yes | Reset per-card session progress |
| GET | /api/search?q=...&mode=... | Yes | Full-text or semantic search |
| GET | /api/analytics/decks/{deckId} | Yes | Deck metrics + concept graph |
| GET | /api/users/me/streak | Yes | User streak statistics |
| GET | /actuator/health | No | Service health check |

### Core Request/Response Contracts

#### Auth

`POST /api/auth/signup`

Request:

```json
{
  "email": "user@example.com",
  "password": "Passw0rd!123"
}
```

Response:

```json
{
  "token": "<jwt>",
  "userId": "uuid",
  "email": "user@example.com"
}
```

`POST /api/auth/login` uses the same contract.

#### Decks

`POST /api/decks`

```json
{
  "title": "Distributed Systems"
}
```

`GET /api/decks` returns per-deck counters (`totalCards`, `masteredCards`, `shakyCards`, `dueToday`, `nextReviewDate`, `masteryPercent`).

#### Ingestion

`POST /api/ingestion/upload?deckId=<uuid>`

- Content-Type: `multipart/form-data`
- Field name: `file`

Response:

```json
{
  "jobId": "uuid",
  "file_key": "user/deck/file.pdf",
  "status": "QUEUED",
  "message": "Ingestion started"
}
```

`GET /api/ingestion/jobs/{jobId}`

```json
{
  "jobId": "uuid",
  "deckId": "uuid",
  "fileKey": "...",
  "status": "PROCESSING",
  "stage": "extracting_cards",
  "totalChunks": 14,
  "processedChunks": 5,
  "cardsCreated": 31,
  "skippedLowQualityCards": 4,
  "skippedDuplicates": 2,
  "errorMessage": null,
  "createdAt": "...",
  "startedAt": "...",
  "finishedAt": null,
  "updatedAt": "..."
}
```

Status values:

- `QUEUED`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

Typical stage values:

- `queued`
- `extracting_pdf`
- `extracting_cards`
- `persisting_concept_graph`
- `completed`
- `completed_with_graph`
- `completed_no_chunks`
- `failed`

#### Cards and Review

`POST /api/cards/{cardId}/review`

Request:

```json
{
  "grade": 4
}
```

Response includes updated SM-2 state:

```json
{
  "cardId": "uuid",
  "grade": 4,
  "easinessFactor": 2.6,
  "intervalDays": 6,
  "repetitionCount": 2,
  "averageGrade": 4.5,
  "nextReviewDate": "2026-04-23",
  "mastered": false,
  "shaky": false
}
```

#### Session

`PUT /api/decks/{deckId}/session`

```json
{
  "currentCardIndex": 10,
  "completedCards": 7,
  "totalCards": 40,
  "allCardsMode": true
}
```

`GET /api/decks/{deckId}/session` response includes:

- `deckCycleCompleted`
- `completedCardIds`
- `lastAccessed`

#### Search

`GET /api/search?q=event sourcing&mode=semantic&deckId=<uuid>&limit=20`

Response:

```json
{
  "mode": "semantic",
  "query": "event sourcing",
  "results": [
    {
      "cardId": "uuid",
      "deckId": "uuid",
      "type": "DEFINITION",
      "front": "...",
      "back": "...",
      "score": 0.82
    }
  ]
}
```

#### Analytics

`GET /api/analytics/decks/{deckId}`

```json
{
  "deckId": "uuid",
  "masteredCards": 18,
  "shakyCards": 5,
  "dueToday": 9,
  "conceptGraph": {
    "nodes": [{ "id": "TCP" }],
    "links": [{ "source": "TCP", "target": "Congestion Control", "label": "enables" }]
  }
}
```

#### Streak

`GET /api/users/me/streak`

```json
{
  "currentStreakDays": 12,
  "longestStreakDays": 30,
  "totalLogins": 48,
  "totalActions": 312,
  "lastLoginDate": "2026-04-17",
  "lastActivityDate": "2026-04-17"
}
```

## Database and Migrations

Flyway migrations are located in `backend/src/main/resources/db/migration`.

Core schema objects include:

- `users`
- `decks`
- `cards` (`embedding vector(256)`, `search_vector tsvector`)
- `card_sm2_state`
- `review_history`
- `session_state`
- `session_card_progress`
- `deck_concept_graph`
- `user_streak_stats`
- `ingestion_jobs`

Key data/index features:

- GIN index for full-text search.
- IVFFLAT vector index for semantic similarity.
- Trigger-maintained `search_vector` on insert/update.
- Per-user and per-deck indexes for ingestion and progress retrieval.

## Setup and Run

### Prerequisites

- Java 21+
- Maven 3.9+
- Node.js 18+
- Docker and Docker Compose (recommended)

### Environment Configuration

1. Copy `.env.example` to `.env` at project root.
2. Fill required values.

Required for core app:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DB_SCHEMA`
- `JWT_SECRET`

Required for PDF ingestion:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Optional AI enhancement:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Frontend API URL:

- `VITE_API_BASE_URL` (optional, defaults to `http://localhost:8080`)

### Option A: Full Stack via Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- Postgres: `localhost:5432`

### Option B: Run Backend and Frontend Separately

Backend:

```bash
cd backend
mvn spring-boot:run
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Validation and Quality Checks

Backend unit tests:

```bash
cd backend
mvn test
```

Frontend production build (TypeScript + Vite):

```bash
cd frontend
npm run build
```

Recommended pre-merge gate:

1. `mvn test`
2. `npm run build`
3. Upload one PDF and verify ingestion reaches `COMPLETED`
4. Verify search and review endpoints for the new deck

### Quick API Smoke Flow (Curl)

1. Signup or login and capture token.
2. Create a deck.
3. Upload a PDF.
4. Poll ingestion job until terminal state.
5. Fetch cards and submit a review.

Example upload command:

```bash
curl -X POST "http://localhost:8080/api/ingestion/upload?deckId=<deck-uuid>" \
  -H "Authorization: Bearer <token>" \
  -F "file=@/absolute/path/to/file.pdf"
```

Poll job command:

```bash
curl -X GET "http://localhost:8080/api/ingestion/jobs/<job-uuid>" \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

### Backend exits at startup

Check:

- PostgreSQL is running and reachable from `DB_URL`.
- Credentials (`DB_USER`, `DB_PASSWORD`) are correct.
- `DB_SCHEMA` is valid and migration user has schema privileges.
- Java version is 21-compatible for this build configuration.

### Upload fails with 503

Cause:

- R2 client is not configured.

Fix:

- Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` in `.env`.

### Upload accepted but no cards appear

Check:

- `GET /api/ingestion/jobs/{jobId}` status and `errorMessage`.
- Ingestion stage progression (`extracting_pdf` -> `extracting_cards` -> `completed`).
- Backend logs for extraction/parsing warnings.

### Semantic search returns weak results

Check:

- Cards exist and ingestion completed.
- Embeddings are generated during ingestion.
- Query text is specific enough for retrieval.

## Project Structure

```text
backend/
  src/main/java/com/flashcardengine/backend/
    analytics/ auth/ card/ config/ deck/ ingestion/
    search/ session/ storage/ streak/ common/
  src/main/resources/
    application.yml
    db/migration/
frontend/
  src/
    api/ components/ pages/ store/ types/
docker-compose.yml
```

## Final Notes

- This system is designed for correctness first: user isolation, deterministic scheduling, robust fallbacks, and observable ingestion state.
- The backend contracts are stable and frontend polling is aligned with ingestion lifecycle events.
- The architecture is ready for further extension (role policies, richer analytics, queue workers, external embedding providers) without changing core API semantics.