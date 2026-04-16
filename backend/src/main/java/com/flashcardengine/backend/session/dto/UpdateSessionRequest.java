package com.flashcardengine.backend.session.dto;

import jakarta.validation.constraints.Min;

public record UpdateSessionRequest(
    @Min(0) int currentCardIndex,
    @Min(0) int completedCards,
    @Min(0) int totalCards,
    boolean allCardsMode
) {
}
