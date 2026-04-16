package com.flashcardengine.backend.search.dto;

import com.flashcardengine.backend.persistence.entity.CardType;

import java.util.UUID;

public record SearchCardResultResponse(
    UUID cardId,
    UUID deckId,
    CardType type,
    String front,
    String back,
    double score
) {
}
