package com.flashcardengine.backend.ingestion.dto;

import java.time.Instant;
import java.util.UUID;

public record IngestionJobStatusResponse(
    UUID jobId,
    UUID deckId,
    String fileKey,
    String status,
    String stage,
    int totalChunks,
    int processedChunks,
    int cardsCreated,
    int skippedLowQualityCards,
    int skippedDuplicates,
    String errorMessage,
    Instant createdAt,
    Instant startedAt,
    Instant finishedAt,
    Instant updatedAt
) {
}