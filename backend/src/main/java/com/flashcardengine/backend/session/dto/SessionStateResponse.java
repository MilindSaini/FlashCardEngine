package com.flashcardengine.backend.session.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SessionStateResponse(
    UUID deckId,
    int currentCardIndex,
    int completedCards,
    int totalCards,
    boolean allCardsMode,
    boolean deckCycleCompleted,
    List<UUID> completedCardIds,
    Instant lastAccessed
) {
}
