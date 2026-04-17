package com.flashcardengine.backend.deck.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DeckSummaryResponse(
    UUID id,
    String title,
    Instant lastReviewedAt,
    Instant createdAt,
    long totalCards,
    long masteredCards,
    long shakyCards,
    long dueToday,
    LocalDate nextReviewDate,
    double masteryPercent
) {
}
