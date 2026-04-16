# AI Flashcard Learning System

A full-stack flashcard platform built around:
- Depth-first PDF ingestion with multi-pass AI extraction
- True SM-2 spaced repetition scheduling
- Explicit mastery/shaky/upcoming modeling
- Delight-driven review UX with animated card flips and visual analytics
- Stateless JWT backend with user-scoped access

## Stack

- Frontend: React + Vite + TypeScript + Zustand + React Query + Framer Motion
- Backend: Spring Boot 3 + JPA + Flyway + JWT + async ingestion
- Database: PostgreSQL + pgvector + tsvector indexes
- Object Storage: Cloudflare R2 (S3-compatible)
- Deployment: Docker + Docker Compose

## Repository Layout

- `backend/` Spring Boot API and ingestion pipeline
- `frontend/` React web app
- `docker-compose.yml` local orchestration for database + backend + frontend

## Core Features

### 1. Auth and Isolation
- Signup/login using BCrypt password hashing
- Stateless JWT authentication
- User-scoped deck/card/session queries

### 2. Deck and Review Workflow
- Create/list decks with mastery summaries
- Fetch due cards by deck
- Submit 0-5 grades to SM-2 scheduler
- Persist per-deck session position for Resume

### 3. SM-2 Implementation
- EF update formula:
  - `EF = max(1.3, EF + 0.1 - (5-q)*(0.08 + (5-q)*0.02))`
- Interval logic:
  - rep 0 => 1 day
  - rep 1 => 6 days
  - rep >= 2 => previous_interval * EF
- Low grades (<3) reset repetitions and interval

### 4. Ingestion Pipeline
- Upload PDF to Cloudflare R2
- Publish async ingestion event
- Extract text with PDFBox
- Chunk text (~1000 token approximation)
- Four AI passes per chunk:
  - Definitions
  - Relationships (graph JSON)
  - Edge cases
  - Worked examples
- Persist cards + initialize SM-2 state + embeddings

### 5. Search and Analytics
- Full-text search through `tsvector`
- Semantic search through pgvector cosine distance
- Analytics endpoint includes:
  - mastered/shaky/due metrics
  - 90-day review heatmap data
  - forgetting curve points for visualization

## Local Setup

### 1. Copy environment template

Copy `.env.example` to `.env` and fill values:
- PostgreSQL
- `DB_SCHEMA` (default `flashcard_engine`)
- JWT secret
- Cloudflare R2 credentials
- Gemini API key (optional, fallback extraction exists)

If you use Supabase via `DB_URL`, keep `DB_SCHEMA` set so the app uses a dedicated schema instead of `public`.
For Supabase pooler connections, add `prepareThreshold=0` in `DB_URL` to avoid prepared-statement conflicts.

### 2. Run with Docker Compose

From repository root:

```bash
docker compose up --build
```

Services:
- Frontend: http://localhost:5173
- Backend: http://localhost:8080
- Postgres: localhost:5432

## API Overview

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/decks`
- `POST /api/decks`
- `POST /api/ingestion/upload?deckId={deckId}`
- `GET /api/decks/{deckId}/due-cards`
- `POST /api/cards/{cardId}/review`
- `GET /api/decks/{deckId}/session`
- `PUT /api/decks/{deckId}/session`
- `GET /api/search?q={query}&mode=fulltext|semantic&deckId={optional}`
- `GET /api/analytics/decks/{deckId}`

## Testing

Implemented unit tests include:
- SM-2 algorithm behavior and edge cases
- Review service persistence flow
- Gemini extraction fallback parsing behavior

Run backend tests with Maven in `backend/`.

## Notes

- `cards.search_vector` is maintained via trigger.
- `cards.embedding` uses pgvector and semantic ranking queries.
- R2 bucket should stay private; backend streams uploads/downloads.
- Flyway migration `V2__move_objects_to_app_schema.sql` moves existing objects from `public` into `DB_SCHEMA`.
- Flyway migration `V3__ensure_app_schema_objects.sql` guarantees all required flashcard tables/types/indexes exist in `DB_SCHEMA`.
