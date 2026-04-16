package com.flashcardengine.backend.ingestion;

import com.flashcardengine.backend.persistence.entity.CardType;

public record GeneratedCardDraft(
    CardType type,
    String front,
    String back
) {
}
